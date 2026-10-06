import { request, type IncomingMessage, type Server } from 'http'
import type { AddressInfo } from 'net'
import { addHandler, addListener, sendFrontendMessage } from 'backend/ipc'
import { createApiServer } from '../server'

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

const TOKEN = 'secret-token'

let server: Server
let port: number

beforeAll(async () => {
  server = createApiServer(TOKEN)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})

afterAll(() => {
  server.closeAllConnections()
  server.close()
})

type Reply = { status: number; body: Record<string, unknown> }

function call(
  method: string,
  path: string,
  options: { token?: string | null; body?: string; headers?: object } = {}
): Promise<Reply> {
  const { token = TOKEN, body, headers } = options
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers: { ...(token ? { 'x-relicd-token': token } : {}), ...headers }
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: data ? (JSON.parse(data) as Reply['body']) : {}
          })
        )
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

describe('API server', () => {
  test('GET /health answers without a token', async () => {
    const reply = await call('GET', '/health', { token: null })
    expect(reply.status).toBe(200)
    expect(reply.body.status).toBe('ok')
  })

  test('rejects a missing or wrong token', async () => {
    expect(
      (await call('POST', '/api/getLibrary', { token: null })).status
    ).toBe(401)
    expect(
      (await call('POST', '/api/getLibrary', { token: 'nope' })).status
    ).toBe(401)
  })

  test('rejects browser requests (Origin) and foreign Host headers', async () => {
    const origin = await call('GET', '/health', {
      headers: { Origin: 'https://evil.example' }
    })
    expect(origin.status).toBe(403)

    const host = await call('GET', '/health', {
      headers: { Host: 'evil.example' }
    })
    expect(host.status).toBe(403)
  })

  test('does not reach channels outside the allow list', async () => {
    addHandler('getShellPath', async () => '/etc')
    const reply = await call('POST', '/api/getShellPath', { body: '{}' })
    expect(reply.status).toBe(403)
  })

  test('calls a handler with the given args and returns its result', async () => {
    addHandler('getRelicVersion', () => '9.9.9')
    const reply = await call('POST', '/api/getRelicVersion')
    expect(reply).toEqual({ status: 200, body: { result: '9.9.9' } })

    addHandler('isNative', (_e, { appName, runner }) => runner === appName)
    const withArgs = await call('POST', '/api/isNative', {
      body: JSON.stringify({ args: [{ appName: 'gog', runner: 'gog' }] })
    })
    expect(withArgs.body.result).toBe(true)
  })

  test('a handler that returns nothing answers null', async () => {
    addHandler('getRefreshingLibraries', () => undefined as never)
    const reply = await call('POST', '/api/getRefreshingLibraries')
    expect(reply).toEqual({ status: 200, body: { result: null } })
  })

  test('dispatches a listener channel and answers null', async () => {
    const listener = jest.fn()
    addListener('logoutGOG', listener)

    const reply = await call('POST', '/api/logoutGOG')

    expect(reply).toEqual({ status: 200, body: { result: null } })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('404 for an exposed channel nobody handles, 400 for bad JSON, 500 on error', async () => {
    expect((await call('POST', '/api/logoutZoom')).status).toBe(404)
    expect(
      (await call('POST', '/api/getEpicGamesStatus', { body: '{oops' })).status
    ).toBe(400)

    addHandler('getEpicGamesStatus', () => {
      throw new Error('boom')
    })
    const failed = await call('POST', '/api/getEpicGamesStatus')
    expect(failed.status).toBe(500)
    expect(failed.body.error).toBe('boom')
  })

  test('GET /events streams the exposed events only', async () => {
    const received = await new Promise<string>((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path: '/events',
          headers: { 'x-relicd-token': TOKEN }
        },
        (res: IncomingMessage) => {
          let data = ''
          res.on('data', (chunk: Buffer) => {
            data += chunk.toString()
            if (data.includes('event: refreshLibrary')) {
              req.destroy()
              resolve(data)
            }
          })
          // Give the server time to register the subscription
          setTimeout(() => {
            sendFrontendMessage('maximized' as 'refreshLibrary')
            sendFrontendMessage('refreshLibrary', 'gog')
          }, 50)
        }
      )
      req.on('error', (error) => {
        if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET')
          reject(error)
      })
      req.end()
    })

    expect(received).toContain('event: refreshLibrary\ndata: ["gog"]')
    expect(received).not.toContain('maximized')
  })
})
