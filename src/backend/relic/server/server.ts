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
import { logError, logInfo, LogPrefix } from 'backend/logger'
import { relicVersion } from 'backend/constants/others'
import { exposedChannels, exposedEvents } from './allowlist'

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

/** Only the loopback address is allowed as Host, and browsers are refused (no Origin) */
function isLocalRequest(req: IncomingMessage): boolean {
  if (req.headers.origin) return false
  const port = req.socket.localPort
  const host = req.headers.host ?? ''
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`
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
  channel: string
) {
  if (!exposedChannels.has(channel)) {
    return sendJson(res, 403, { error: `channel "${channel}" is not exposed` })
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
 * Everything but /health needs the `x-relicd-token` header.
 */
export function createApiServer(token: string): Server {
  return createServer((req, res) => {
    if (!isLocalRequest(req)) {
      return sendJson(res, 403, { error: 'forbidden' })
    }

    const { pathname } = new URL(req.url ?? '/', 'http://localhost')

    if (req.method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, { status: 'ok', version: relicVersion })
    }

    if (!hasValidToken(req, token)) {
      return sendJson(res, 401, { error: 'invalid or missing token' })
    }

    if (req.method === 'GET' && pathname === '/events') {
      return handleEvents(req, res)
    }

    if (req.method === 'POST' && pathname.startsWith(API_PREFIX)) {
      return void handleCall(req, res, pathname.slice(API_PREFIX.length))
    }

    return sendJson(res, 404, { error: 'not found' })
  })
}

export function listenApiServer(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      logInfo(`API listening on 127.0.0.1:${port}`, LogPrefix.Backend)
      resolve()
    })
  })
}
