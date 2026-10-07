import { timingSafeEqual } from 'crypto'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'http'
import {
  dispatchListener,
  hasHandler,
  invokeHandler,
  onFrontendMessage
} from 'backend/ipc'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { relicVersion } from 'backend/constants/others'
import type { WebAccess } from 'common/relic/web'
import { exposedChannels, exposedEvents } from './allowlist'
import { allowedHosts, isBlockedFromNetwork, isOwnOrigin } from './access'
import { defaultWebDir, webFile, webHeaders } from './web'

const MAX_BODY_BYTES = 1024 * 1024
const HEARTBEAT_MS = 25_000

const API_PREFIX = '/api/'

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  })
  res.end(payload)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function hasValidToken(req: IncomingMessage, token: string): boolean {
  const received = Buffer.from(String(req.headers['x-relicd-token'] ?? ''))
  const expected = Buffer.from(token)
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  )
}

/** Why a request is refused before anything else: its `Host` or its `Origin` is not relicd's own */
function refusal(req: IncomingMessage, mode: WebAccess): string | undefined {
  const host = (req.headers.host ?? '').toLowerCase()
  const port = req.socket.localPort ?? 0
  if (!allowedHosts(port, mode).has(host))
    return mode === 'network'
      ? `Host "${host}" is not allowed: open relicd by the IP or the name of this machine`
      : 'forbidden'
  if (!isOwnOrigin(req.headers.origin, host)) return 'forbidden'
  return undefined
}

function parseArgs(body: string): unknown[] {
  if (!body.trim()) return []
  const parsed = JSON.parse(body) as { args?: unknown }
  if (parsed.args === undefined) return []
  if (!Array.isArray(parsed.args)) throw new Error('"args" must be an array')
  return parsed.args as unknown[]
}

async function handleCall(
  req: IncomingMessage,
  res: ServerResponse,
  channel: string,
  mode: WebAccess
) {
  if (!exposedChannels.has(channel)) {
    return sendJson(res, 403, { error: `channel "${channel}" is not exposed` })
  }
  if (isBlockedFromNetwork(channel, req.socket.remoteAddress, mode)) {
    return sendJson(res, 403, {
      error: `"${channel}" can only be called from the machine relicd runs on: open the web there as http://127.0.0.1:${req.socket.localPort}`
    })
  }

  let args: unknown[]
  try {
    args = parseArgs(await readBody(req))
  } catch (error) {
    return sendJson(res, 400, { error: String(error) })
  }

  try {
    if (hasHandler(channel)) {
      const result = (await invokeHandler(channel, ...args)) ?? null
      return sendJson(res, 200, { result })
    }
    if (dispatchListener(channel, ...args)) {
      return sendJson(res, 200, { result: null })
    }
    return sendJson(res, 404, { error: `no handler for "${channel}"` })
  } catch (error) {
    logError([`API call "${channel}" failed:`, error], LogPrefix.Backend)
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

function handleEvents(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
  res.write(': connected\n\n')

  const unsubscribe = onFrontendMessage((channel, args) => {
    if (!exposedEvents.has(channel)) return
    res.write(`event: ${channel}\ndata: ${JSON.stringify(args)}\n\n`)
  })
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS)

  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
}

/**
 * Local HTTP API of the daemon:
 *   GET  /health            no token
 *   POST /api/<channel>     body {"args": [...]} -> {"result": ...}
 *   GET  /events            Server-Sent Events (see allowlist.ts)
 *   GET  /<file>            relicd's own web, if there is one (no token: it carries it)
 * Everything but /health needs the `x-relicd-token` header.
 */
export type ServerSetup = {
  /** Who can open the web (the API is always on this machine unless it is `network`) */
  web?: WebAccess
  webDir?: string
}

export function createApiServer(
  token: string,
  { web = 'local', webDir = defaultWebDir() }: ServerSetup = {}
): Server {
  return createServer((req, res) => {
    const refused = refusal(req, web)
    if (refused) return sendJson(res, 403, { error: refused })

    const { pathname } = new URL(req.url ?? '/', 'http://localhost')

    if (req.method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, {
        status: 'ok',
        version: relicVersion,
        web
      })
    }

    if (req.method === 'GET' && web !== 'off') {
      const file = webFile(webDir, pathname, token, web)
      if (file) {
        res.writeHead(200, { 'Content-Type': file.type, ...webHeaders })
        return void res.end(file.body)
      }
    }

    if (!hasValidToken(req, token)) {
      return sendJson(res, 401, { error: 'invalid or missing token' })
    }

    if (req.method === 'GET' && pathname === '/events') {
      return handleEvents(req, res)
    }

    if (req.method === 'POST' && pathname.startsWith(API_PREFIX)) {
      return void handleCall(req, res, pathname.slice(API_PREFIX.length), web)
    }

    return sendJson(res, 404, { error: 'not found' })
  })
}

const NETWORK_WARNING =
  'The web is open to the whole network WITHOUT protection: anyone who can reach this machine controls relicd. Experimental or home use only.'

export function listenApiServer(
  server: Server,
  port: number,
  mode: WebAccess
): Promise<void> {
  const address = mode === 'network' ? '0.0.0.0' : '127.0.0.1'
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, address, () => {
      logInfo(
        `API listening on ${address}:${port} (web: ${mode})`,
        LogPrefix.Backend
      )
      if (mode === 'network') logWarning(NETWORK_WARNING, LogPrefix.Backend)
      resolve()
    })
  })
}
