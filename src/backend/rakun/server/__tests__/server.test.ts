import { request, type IncomingMessage, type Server } from 'http'
import type { AddressInfo } from 'net'
import { networkInterfaces } from 'os'
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
        headers: { ...(token ? { 'x-rakun-token': token } : {}), ...headers }
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
    addHandler('notExposed' as never, () => '/etc' as never)
    const reply = await call('POST', '/api/notExposed', { body: '{}' })
    expect(reply.status).toBe(403)
  })

  test('calls a handler with the given args and returns its result', async () => {
    addHandler('getRakunVersion', () => '9.9.9')
    const reply = await call('POST', '/api/getRakunVersion')
    expect(reply).toEqual({ status: 200, body: { result: '9.9.9' } })

    addHandler('getGameInfo', (_e, appName, runner) =>
      Promise.resolve({ appName, runner } as never)
    )
    const withArgs = await call('POST', '/api/getGameInfo', {
      body: JSON.stringify({ args: ['x', 'gog'] })
    })
    expect(withArgs.body.result).toEqual({ appName: 'x', runner: 'gog' })
  })

  test('a handler that returns nothing answers null', async () => {
    addHandler('getRefreshingLibraries', () => undefined as never)
    const reply = await call('POST', '/api/getRefreshingLibraries')
    expect(reply).toEqual({ status: 200, body: { result: null } })
  })

  test('dispatches a listener channel and answers null', async () => {
    const listener = jest.fn()
    addListener('resumeCurrentDownload', listener)

    const reply = await call('POST', '/api/resumeCurrentDownload')

    expect(reply).toEqual({ status: 200, body: { result: null } })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('404 for an exposed channel nobody handles, 400 for bad JSON, 500 on error', async () => {
    expect((await call('POST', '/api/cancelDownload')).status).toBe(404)
    expect(
      (await call('POST', '/api/getRakunVersion', { body: '{oops' })).status
    ).toBe(400)

    addHandler('getRakunVersion', () => {
      throw new Error('boom')
    })
    const failed = await call('POST', '/api/getRakunVersion')
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
          headers: { 'x-rakun-token': TOKEN }
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

describe('web modes', () => {
  const servers: Server[] = []
  afterAll(() => {
    servers.forEach((s) => {
      s.closeAllConnections()
      s.close()
    })
  })

  async function modeServer(web: 'local' | 'network' | 'off', webDir?: string) {
    const instance = createApiServer(TOKEN, { web, webDir })
    await new Promise<void>((resolve) =>
      instance.listen(0, '127.0.0.1', resolve)
    )
    servers.push(instance)
    const modePort = (instance.address() as AddressInfo).port
    return (path: string, headers: Record<string, string> = {}) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = request(
          { host: '127.0.0.1', port: modePort, path, headers },
          (res) => {
            let body = ''
            res.on('data', (chunk) => (body += chunk))
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
          }
        )
        req.on('error', reject)
        req.end()
      })
  }

  test('/health says which mode the web is in', async () => {
    for (const mode of ['local', 'network', 'off'] as const) {
      const get = await modeServer(mode)
      expect(JSON.parse((await get('/health')).body).web).toBe(mode)
    }
  })

  test('in network mode the Host of the machine is accepted, a foreign one is not and says why', async () => {
    const get = await modeServer('network')
    const own = (await import('os')).hostname().toLowerCase()
    const port = servers.at(-1)?.address() as AddressInfo
    expect((await get('/health', { Host: `${own}:${port.port}` })).status).toBe(
      200
    )
    const foreign = await get('/health', { Host: `evil.example:${port.port}` })
    expect(foreign.status).toBe(403)
    expect(foreign.body).toContain('IP or the name of this machine')
  })

  test('in local mode a Host that is not loopback is refused', async () => {
    const get = await modeServer('local')
    const own = (await import('os')).hostname().toLowerCase()
    const port = servers.at(-1)?.address() as AddressInfo
    expect((await get('/health', { Host: `${own}:${port.port}` })).status).toBe(
      403
    )
  })

  const lanAddress = Object.values(networkInterfaces())
    .flatMap((list) => list ?? [])
    .find((entry) => entry.family === 'IPv4' && !entry.internal)?.address

  // A connection to the address of the LAN, even from this very machine, is not a loopback one
  const testWithLan = lanAddress ? test : test.skip

  testWithLan(
    'in network mode the settings answer to this machine and not to the network',
    async () => {
      addHandler('writeConfig', () => undefined as never)
      const networked = createApiServer(TOKEN, { web: 'network' })
      await new Promise<void>((resolve) =>
        networked.listen(0, '0.0.0.0', resolve)
      )
      servers.push(networked)
      const networkPort = (networked.address() as AddressInfo).port

      const post = (host: string) =>
        new Promise<number>((resolve, reject) => {
          const req = request(
            {
              host,
              port: networkPort,
              method: 'POST',
              path: '/api/writeConfig',
              headers: { 'x-rakun-token': TOKEN }
            },
            (res) => {
              res.resume()
              resolve(res.statusCode ?? 0)
            }
          )
          req.on('error', reject)
          req.end('{}')
        })

      expect(await post('127.0.0.1')).toBe(200)
      expect(await post(lanAddress as string)).toBe(403)
    }
  )
})
