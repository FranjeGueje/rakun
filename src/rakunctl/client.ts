import { readFileSync } from 'fs'
import { request as httpRequest, IncomingMessage } from 'http'
import { homedir } from 'os'
import { join } from 'path'

/** An expected failure: its message is shown as is, without a stack */
export class CliError extends Error {}

export type Credentials = { port: number; token: string }

export type ApiEvent = { event: string; args: unknown[] }

export type Api = {
  /** The port rakun listens on (from `api.json`) */
  port: number
  health: () => Promise<{ status: string; version: string; web?: string }>
  call: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>
  // Resolves once connected, so nothing sent after it can be missed
  events: () => Promise<AsyncGenerator<ApiEvent>>
}

export function credentialsFile(): string {
  return (
    process.env.RAKUN_API_FILE ??
    join(homedir(), '.config', 'rakun', 'api.json')
  )
}

export function parseCredentials(raw: string, file: string): Credentials {
  let parsed: Partial<Credentials>
  try {
    parsed = JSON.parse(raw) as Partial<Credentials>
  } catch {
    throw new CliError(`${file} no es un JSON válido`)
  }
  if (!parsed.port || !parsed.token) {
    throw new CliError(`${file} no tiene puerto y token`)
  }
  return { port: parsed.port, token: parsed.token }
}

export function readCredentials(file = credentialsFile()): Credentials {
  let raw: string
  try {
    raw = readFileSync(file, 'utf-8')
  } catch {
    throw new CliError(
      `rakun parado (no existe ${file}); arráncalo con "rakunctl start"`
    )
  }
  return parseCredentials(raw, file)
}

export function messageForStatus(
  status: number,
  channel: string,
  body: string
): string {
  if (status === 401) return 'rakun ha rechazado el token (401)'
  if (status === 403) return `la API no expone el canal "${channel}" (403)`
  if (status === 404) return `rakun no tiene manejador para "${channel}" (404)`
  return `${errorOf(body) ?? 'error desconocido'} (${status})`
}

function errorOf(body: string): string | undefined {
  try {
    return (JSON.parse(body) as { error?: string }).error
  } catch {
    return body.trim() || undefined
  }
}

// node:http and not fetch: fetch gives up waiting for the response headers
// after 5 minutes, and a repair answers only when it has finished
function send(
  creds: Credentials,
  method: string,
  path: string,
  body?: string
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port: creds.port,
        method,
        path,
        headers: {
          'x-rakun-token': creds.token,
          'content-type': 'application/json'
        }
      },
      resolve
    )
    req.once('error', () =>
      reject(
        new CliError(
          `rakun parado (no responde en 127.0.0.1:${creds.port}); arráncalo con "rakunctl start"`
        )
      )
    )
    req.end(body)
  })
}

async function readBody(res: IncomingMessage): Promise<string> {
  res.setEncoding('utf8')
  let text = ''
  for await (const chunk of res) text += chunk as string
  return text
}

export function parseSseBlock(block: string): ApiEvent | undefined {
  const lines = block.split('\n')
  const event = lines.find((line) => line.startsWith('event: '))?.slice(7)
  const data = lines.find((line) => line.startsWith('data: '))?.slice(6)
  if (!event || data === undefined) return undefined // a `: ping` comment
  return { event, args: JSON.parse(data) as unknown[] }
}

async function* readEvents(res: IncomingMessage): AsyncGenerator<ApiEvent> {
  res.setEncoding('utf8')
  let buffer = ''
  for await (const chunk of res) {
    buffer += chunk as string
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const parsed = parseSseBlock(block)
      if (parsed) yield parsed
    }
  }
}

export function createApi(creds: Credentials): Api {
  return {
    port: creds.port,
    async health() {
      const res = await send(creds, 'GET', '/health')
      return JSON.parse(await readBody(res)) as {
        status: string
        version: string
        web?: string
      }
    },
    async call<T>(channel: string, ...args: unknown[]) {
      const res = await send(
        creds,
        'POST',
        `/api/${channel}`,
        JSON.stringify({ args })
      )
      const text = await readBody(res)
      if (res.statusCode !== 200) {
        throw new CliError(messageForStatus(res.statusCode ?? 0, channel, text))
      }
      return (JSON.parse(text) as { result: T }).result
    },
    async events() {
      const res = await send(creds, 'GET', '/events')
      if (res.statusCode !== 200) {
        const text = await readBody(res)
        throw new CliError(
          messageForStatus(res.statusCode ?? 0, 'events', text)
        )
      }
      return readEvents(res)
    }
  }
}
