import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { request, type Server } from 'http'
import type { AddressInfo } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'
import { createApiServer } from '../server'
import { webFile, withMeta } from '../web'

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

const TOKEN = 'secret-token'
const root = mkdtempSync(join(tmpdir(), 'rakun-web-'))
const webDir = join(root, 'web')
mkdirSync(join(webDir, 'assets'), { recursive: true })
writeFileSync(
  join(webDir, 'index.html'),
  '<!doctype html><html><head><title>x</title></head><body></body></html>'
)
writeFileSync(join(webDir, 'assets', 'app.js'), 'console.log(1)')
writeFileSync(join(webDir, 'assets', 'app.css'), 'body{}')
writeFileSync(join(root, 'secret.txt'), 'outside')

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('withMeta', () => {
  test('puts the token and the web mode in the head', () => {
    expect(
      withMeta('<html><head><title>x</title></head></html>', 'abc', 'network')
    ).toBe(
      '<html><head><meta name="rakun-token" content="abc"><meta name="rakun-web" content="network"><title>x</title></head></html>'
    )
  })

  test('without a head it goes first', () => {
    expect(withMeta('<p>hi</p>', 'abc', 'local')).toBe(
      '<meta name="rakun-token" content="abc"><meta name="rakun-web" content="local"><p>hi</p>'
    )
  })
})

describe('webFile', () => {
  test('/ is the index, with the token, and the others keep their type', () => {
    const index = webFile(webDir, '/', TOKEN, 'local')
    expect(index?.type).toContain('text/html')
    expect(String(index?.body)).toContain(
      `<meta name="rakun-token" content="${TOKEN}">`
    )
    expect(webFile(webDir, '/assets/app.js', TOKEN, 'local')?.type).toContain(
      'text/javascript'
    )
    expect(webFile(webDir, '/assets/app.css', TOKEN, 'local')?.type).toContain(
      'text/css'
    )
  })

  test('nothing outside the folder is ever served', () => {
    for (const path of [
      '/../secret.txt',
      '/%2e%2e/secret.txt',
      '/assets/../../secret.txt',
      '//etc/passwd',
      '/%00',
      '/%E0%A4%A',
      '/assets',
      '/nope.js'
    ])
      expect(webFile(webDir, path, TOKEN, 'local')).toBeUndefined()
  })

  test('without a web folder there is nothing to serve', () => {
    expect(webFile(join(root, 'missing'), '/', TOKEN, 'local')).toBeUndefined()
  })
})

describe('the web over HTTP', () => {
  let server: Server
  let port: number

  beforeAll(async () => {
    server = createApiServer(TOKEN, { webDir })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })
  afterAll(() => {
    server.closeAllConnections()
    server.close()
  })

  const get = (
    path: string,
    headers: Record<string, string> = {}
  ): Promise<{
    status: number
    headers: Record<string, unknown>
    body: string
  }> =>
    new Promise((resolve, reject) => {
      const req = request(
        { host: '127.0.0.1', port, method: 'GET', path, headers },
        (res) => {
          let body = ''
          res.on('data', (chunk) => (body += chunk))
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body
            })
          )
        }
      )
      req.on('error', reject)
      req.end()
    })

  test('the page needs no token and comes with it, safe headers and a CSP', async () => {
    const reply = await get('/')
    expect(reply.status).toBe(200)
    expect(reply.body).toContain(TOKEN)
    expect(reply.headers['x-frame-options']).toBe('DENY')
    expect(reply.headers['x-content-type-options']).toBe('nosniff')
    expect(String(reply.headers['content-security-policy'])).toContain(
      "frame-ancestors 'none'"
    )
  })

  test('the assets are served without a token', async () => {
    const reply = await get('/assets/app.js')
    expect(reply.status).toBe(200)
    expect(reply.body).toBe('console.log(1)')
  })

  test('a Host that is not the loopback gets neither the page nor the token', async () => {
    const reply = await get('/', { Host: 'evil.example' })
    expect(reply.status).toBe(403)
    expect(reply.body).not.toContain(TOKEN)
  })

  test('another origin gets nothing; the own origin may call the API', async () => {
    expect((await get('/', { Origin: 'https://evil.example' })).status).toBe(
      403
    )
    expect(
      (await get('/', { Origin: `http://localhost:${port + 1}` })).status
    ).toBe(403)
    const own = await get('/health', { Origin: `http://127.0.0.1:${port}` })
    expect(own.status).toBe(200)
  })

  test('the API still asks for the token, and a path outside the web is not a file', async () => {
    expect((await get('/events')).status).toBe(401)
    expect((await get('/../secret.txt')).status).toBe(401)
    expect((await get('/nope', { 'x-rakun-token': TOKEN })).status).toBe(404)
  })
})
