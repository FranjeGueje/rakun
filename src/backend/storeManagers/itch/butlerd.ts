import { spawn, type ChildProcess } from 'child_process'
import { mkdirSync } from 'fs'
import { createInterface } from 'readline'
import { Socket } from 'net'
import { dirname } from 'path'

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

export class ButlerdError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message)
  }
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

/**
 * Minimal client of butler's daemon (butlerd): JSON-RPC 2.0, one message per
 * line over TCP. `butler daemon` lives as long as rakun does (`--destiny-pid`).
 */
export class Butlerd {
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private readonly listeners = new Map<string, Set<Notification>>()

  private constructor(
    private readonly daemon: ChildProcess,
    private readonly socket: Socket
  ) {
    createInterface({ input: socket }).on('line', (line) => this.onLine(line))
    socket.on('close', () => this.failAll(new Error('butlerd closed')))
  }

  /** Starts `butler daemon`, connects to it and authenticates */
  static async start(binary: string, dbPath: string): Promise<Butlerd> {
    mkdirSync(dirname(dbPath), { recursive: true })
    const daemon = spawn(
      binary,
      [
        'daemon',
        '--json',
        '--transport=tcp',
        '--keep-alive',
        '--dbpath',
        dbPath,
        '--destiny-pid',
        String(process.pid)
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    )
    try {
      const handshake = await readHandshake(daemon)
      const [host, port] = handshake.tcp.address.split(':')
      const socket = await connect(host, Number(port))
      const client = new Butlerd(daemon, socket)
      await client.call('Meta.Authenticate', { secret: handshake.secret })
      return client
    } catch (error) {
      daemon.kill()
      throw error
    }
  }

  call<T>(method: string, params: object = {}): Promise<T> {
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
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

  /** Runs `fn` when the daemon goes away, so that the next call starts a new one */
  onClose(fn: () => void) {
    this.socket.once('close', fn)
  }

  stop() {
    this.failAll(new Error('butlerd stopped'))
    this.socket.destroy()
    this.daemon.kill()
  }

  private send(message: object) {
    this.socket.write(`${JSON.stringify(message)}\n`)
  }

  private onLine(line: string) {
    const message = JSON.parse(line) as Message
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
      this.listeners.get(message.method)?.forEach((fn) => fn(message.params))
    } else if (message.id !== undefined) {
      this.settle(message.id, message)
    }
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
    this.pending.forEach(({ reject }) => reject(error))
    this.pending.clear()
  }
}

function readHandshake(daemon: ChildProcess): Promise<Handshake> {
  return new Promise((resolve, reject) => {
    if (!daemon.stdout) return reject(new Error('butler has no output'))
    const lines = createInterface({ input: daemon.stdout })
    lines.on('line', (line) => {
      const handshake = parseHandshake(line)
      if (handshake) resolve(handshake)
    })
    daemon.once('error', reject)
    daemon.once('exit', (code) =>
      reject(new Error(`butler daemon exited (${code}) before it was ready`))
    )
  })
}

function connect(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    socket.once('error', reject)
    socket.connect(port, host, () => resolve(socket))
  })
}
