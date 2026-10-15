import { request, type Server } from 'http'
import type { AddressInfo } from 'net'
import { createApiServer } from '../server'
import { itchCallback } from '../../api/login_callback'

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))
jest.mock('../../api/login_callback', () => ({
  ...jest.requireActual('../../api/login_callback'),
  itchCallback: jest.fn()
}))

const TOKEN = 'secret-token'
let server: Server
let port: number

beforeAll(async () => {
  server = createApiServer(TOKEN, { web: 'off' })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})

afterAll(() => {
  server.closeAllConnections()
  server.close()
})

beforeEach(() =>
  jest.mocked(itchCallback).mockResolvedValue({
    status: 200,
    title: 'Logged in to itch.io',
    message: 'rakun is logged in. You can close this tab.'
  })
)

function get(
  path: string,
  headers: Record<string, string> = {},
  method = 'GET'
) {
  return new Promise<{
    status: number
    type: string
    body: string
    headers: object
  }>((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, method, headers },
      (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            type: String(res.headers['content-type']),
            body,
            headers: res.headers
          })
        )
      }
    )
    req.on('error', reject)
    req.end()
  })
}

describe('GET /itch/callback', () => {
  test('answers a page with no token: it is the browser of the user that comes', async () => {
    const reply = await get('/itch/callback?code=C&state=S')

    expect(reply.status).toBe(200)
    expect(reply.type).toContain('text/html')
    expect(reply.body).toContain('Logged in to itch.io')
    expect(reply.headers).toMatchObject({
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer'
    })
  })

  test('hands the query to the login: the state is what decides', async () => {
    await get('/itch/callback?code=C&state=S&error=')

    const query = jest.mocked(itchCallback).mock.calls[0][0]
    expect(query.get('code')).toBe('C')
    expect(query.get('state')).toBe('S')
  })

  test('a browser that comes with a navigation (no Origin) is accepted, a foreign Origin is not', async () => {
    expect((await get('/itch/callback?code=C&state=S')).status).toBe(200)
    expect(
      (
        await get('/itch/callback?code=C&state=S', {
          Origin: 'https://evil.example'
        })
      ).status
    ).toBe(403)
    expect(itchCallback).toHaveBeenCalledTimes(1)
  })

  test("a Host that is not rakun's own is refused before anything", async () => {
    const reply = await get('/itch/callback?code=C&state=S', {
      Host: 'evil.example'
    })
    expect(reply.status).toBe(403)
    expect(itchCallback).not.toHaveBeenCalled()
  })

  test('only GET: anything else needs the token like the rest of the API', async () => {
    const reply = await get('/itch/callback?code=C&state=S', {}, 'POST')
    expect(reply.status).toBe(401)
    expect(itchCallback).not.toHaveBeenCalled()
  })

  test('works with the web turned off', async () => {
    expect((await get('/itch/callback?code=C&state=S')).status).toBe(200)
  })
})
