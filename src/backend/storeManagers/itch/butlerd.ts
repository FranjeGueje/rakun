import { spawn, type ChildProcess } from 'child_process'
import { chmodSync, mkdirSync } from 'fs'
import { createInterface } from 'readline'
import { Socket } from 'net'
import type { Readable } from 'stream'
import { dirname } from 'path'
import { logError, logWarning, LogPrefix } from 'backend/logger'

type Pending = { resolve: (value: never) => void; reject: (e: Error) => void }
type Notification = (params: unknown) => void

/** What butlerd prints when it is ready: where to connect and the secret to authenticate with */
type Handshake = { secret: string; tcp: { address: string } }

/** One JSON-RPC message from butlerd: an answer, a notification or a request of its own */
type Message = {
  id?: number
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string }
}

/** Time given to butler to say where it listens, and to answer a call that is not an operation */
const HANDSHAKE_MS = 30_000
const CALL_MS = 120_000
/** The calls that last as long as the operation does: they have no time limit */
const OPERATIONS = new Set(['Install.Perform', 'Uninstall.Perform'])
/** How much of what butler writes to stderr is kept, to say why it did not start */
const STDERR_KEPT = 1000

export type ButlerdOptions = {
  /** Arguments before `daemon` (to run butler through something else, as the tests do) */
  binaryArgs?: string[]
  /** The environment of the daemon (by default, rakun's own) */
  env?: NodeJS.ProcessEnv
  handshakeMs?: number
  callMs?: number
  /** Called when the daemon goes away, so that the next use starts a new one */
  onClose?: () => void
}

export class ButlerdError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message)
  }
}

/**
 * itch.io refused the key or the token (revoked, or never valid): butlerd
 * answers «itch.io API error (403): /profile: invalid key». A network failure
 * or a server error is another thing and is not this.
 */
export function isAuthRefusal(error: unknown): boolean {
  return (
    error instanceof ButlerdError &&
    /itch\.io API error \((401|403)\)/.test(error.message)
  )
}

/** The line butlerd prints with its address, or undefined for any other line (logs) */
export function parseHandshake(line: string): Handshake | undefined {
  try {
    const parsed = JSON.parse(line) as { type?: string } & Partial<Handshake>
    if (parsed.type !== 'butlerd/listen-notification') return undefined
    return parsed.secret && parsed.tcp ? (parsed as Handshake) : undefined
  } catch {
    return undefined
  }
}

/** The last bytes a stream wrote, as text (it also keeps the pipe drained) */
function keepTail(stream: Readable | null): () => string {
  let tail = ''
  stream?.on('data', (chunk: Buffer) => {
    tail = (tail + chunk.toString('utf-8')).slice(-STDERR_KEPT)
  })
  return () => tail.trim()
}

/**
 * Minimal client of butler's daemon (butlerd): JSON-RPC 2.0, one message per
 * line over TCP. `butler daemon` lives as long as rakun does (`--destiny-pid`).
 */
export class Butlerd {
  private nextId = 1
  private closed = false
  private readonly pending = new Map<number, Pending>()
  private readonly listeners = new Map<string, Set<Notification>>()

  private constructor(
    private readonly daemon: ChildProcess,
    private readonly socket: Socket,
    private readonly callMs: number,
    onClose?: () => void
  ) {
    createInterface({ input: socket }).on('line', (line) => this.onLine(line))
    // The `close` that follows is what ends the client
    socket.on('error', () => undefined)
    socket.on('close', () => {
      this.closed = true
      this.failAll(new Error('butlerd closed'))
      // A daemon left alive would keep the database and the next start would make a second one
      this.daemon.kill()
      onClose?.()
    })
  }

  /** Starts `butler daemon`, connects to it and authenticates */
  static async start(
    binary: string,
    dbPath: string,
    options: ButlerdOptions = {}
  ): Promise<Butlerd> {
    const {
      binaryArgs = [],
      env = process.env,
      handshakeMs = HANDSHAKE_MS,
      callMs = CALL_MS,
      onClose
    } = options
    // Its database holds the credentials of the user: the folder is for this user only
    const folder = dirname(dbPath)
    mkdirSync(folder, { recursive: true, mode: 0o700 })
    chmodSync(folder, 0o700)
    const daemon = spawn(
      binary,
      [
        ...binaryArgs,
        'daemon',
        '--json',
        '--transport=tcp',
        '--keep-alive',
        '--dbpath',
        dbPath,
        '--destiny-pid',
        String(process.pid)
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], env }
    )
    const said = keepTail(daemon.stderr)
    try {
      const handshake = await readHandshake(daemon, handshakeMs)
      const [host, port] = handshake.tcp.address.split(':')
      const socket = await connect(host, Number(port))
      const client = new Butlerd(daemon, socket, callMs, onClose)
      await client.call('Meta.Authenticate', { secret: handshake.secret })
      return client
    } catch (error) {
      daemon.kill()
      const detail = said()
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}${detail ? ` (butler said: ${detail})` : ''}`
      )
    }
  }

  call<T>(method: string, params: object = {}): Promise<T> {
    if (this.closed) return Promise.reject(new Error('butlerd is not running'))
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = OPERATIONS.has(method)
        ? undefined
        : setTimeout(() => {
            this.pending.delete(id)
            reject(
              new Error(
                `butlerd did not answer ${method} in ${Math.round(this.callMs / 1000)} s`
              )
            )
          }, this.callMs)
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        }
      })
      this.send({ jsonrpc: '2.0', id, method, params })
    })
  }

  /** Subscribes to a notification (`Progress`...); returns the way to unsubscribe */
  on(method: string, listener: Notification): () => void {
    const set = this.listeners.get(method) ?? new Set()
    set.add(listener)
    this.listeners.set(method, set)
    return () => set.delete(listener)
  }

  stop() {
    this.closed = true
    this.failAll(new Error('butlerd stopped'))
    this.socket.destroy()
    this.daemon.kill()
  }

  private send(message: object) {
    this.socket.write(`${JSON.stringify(message)}\n`)
  }

  private onLine(line: string) {
    let message: Message
    try {
      message = JSON.parse(line) as Message
    } catch {
      logWarning(
        ['butlerd sent a line that is not JSON:', line.slice(0, 200)],
        LogPrefix.Itch
      )
      return
    }
    if (message.method && message.id !== undefined) {
      // A request of butlerd's own (a question for the client): rakun answers none
      this.send({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32601,
          message: `rakun does not handle ${message.method}`
        }
      })
    } else if (message.method) {
      this.notify(message.method, message.params)
    } else if (message.id !== undefined) {
      this.settle(message.id, message)
    }
  }

  /** Every listener hears it, whatever one of them does */
  private notify(method: string, params: unknown) {
    this.listeners.get(method)?.forEach((listener) => {
      try {
        listener(params)
      } catch (error) {
        logError([`A listener of ${method} failed:`, error], LogPrefix.Itch)
      }
    })
  }

  private settle(id: number, message: Message) {
    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id)
    if (message.error)
      pending.reject(
        new ButlerdError(message.error.code, message.error.message)
      )
    else pending.resolve(message.result as never)
  }

  private failAll(error: Error) {
    const all = [...this.pending.values()]
    this.pending.clear()
    all.forEach(({ reject }) => reject(error))
  }
}

function readHandshake(
  daemon: ChildProcess,
  timeoutMs: number
): Promise<Handshake> {
  return new Promise((resolve, reject) => {
    if (!daemon.stdout) return reject(new Error('butler has no output'))
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `butler daemon did not say where it listens in ${Math.round(timeoutMs / 1000)} s`
          )
        ),
      timeoutMs
    )
    const lines = createInterface({ input: daemon.stdout })
    lines.on('line', (line) => {
      const handshake = parseHandshake(line)
      if (!handshake) return
      clearTimeout(timer)
      resolve(handshake)
    })
    daemon.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    daemon.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`butler daemon exited (${code}) before it was ready`))
    })
  })
}

function connect(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    socket.once('error', reject)
    socket.connect(port, host, () => {
      socket.off('error', reject)
      resolve(socket)
    })
  })
}
