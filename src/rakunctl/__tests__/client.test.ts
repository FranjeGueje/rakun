import { createServer, Server } from 'http'
import { AddressInfo } from 'net'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  CliError,
  createApi,
  messageForStatus,
  parseCredentials,
  parseSseBlock,
  readCredentials
} from '../client'

let server: Server | undefined

afterEach(() => {
  server?.closeAllConnections()
  server?.close()
  server = undefined
})

async function listen(handler: Parameters<typeof createServer>[1]) {
  server = createServer(handler)
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  return { port: (server.address() as AddressInfo).port, token: 'tok' }
}

describe('credentials', () => {
  test('reads port and token from the file', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'rakunctl-')), 'api.json')
    writeFileSync(file, '{"port": 17370, "token": "abc"}')

    expect(readCredentials(file)).toEqual({ port: 17370, token: 'abc' })
  })

  test('a missing file asks whether rakun is running', () => {
    expect(() => readCredentials('/no/such/api.json')).toThrow(
      /rakun is stopped/
    )
  })

  test.each(['not json', '{"port": 1}', '{"token": "x"}'])(
    'rejects %s',
    (raw) => {
      expect(() => parseCredentials(raw, 'api.json')).toThrow(CliError)
    }
  )
})

describe('messageForStatus', () => {
  test.each([
    [401, '', /token/],
    [403, '', /does not expose the channel "ch"/],
    [404, '', /has no handler/],
    [500, '{"error":"boom"}', /boom \(500\)/],
    [400, 'plain text', /plain text \(400\)/]
  ])('%i', (status, body, expected) => {
    expect(messageForStatus(status, 'ch', body)).toMatch(expected)
  })
})

describe('parseSseBlock', () => {
  test('reads event and arguments', () => {
    expect(parseSseBlock('event: refreshLibrary\ndata: ["gog"]')).toEqual({
      event: 'refreshLibrary',
      args: ['gog']
    })
  })

  test('ignores comments', () => {
    expect(parseSseBlock(': ping')).toBeUndefined()
  })
})

describe('call', () => {
  test('posts the arguments with the token and returns the result', async () => {
    let seen = { url: '', token: '', body: '' }
    const creds = await listen((req, res) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        seen = {
          url: req.url ?? '',
          token: String(req.headers['x-rakun-token']),
          body
        }
        res.end('{"result": {"ok": true}}')
      })
    })

    const result = await createApi(creds).call('getLibrary', 'gog')

    expect(result).toEqual({ ok: true })
    expect(seen).toEqual({
      url: '/api/getLibrary',
      token: 'tok',
      body: '{"args":["gog"]}'
    })
  })

  test('turns an error status into a CliError', async () => {
    const creds = await listen((req, res) => {
      res.statusCode = 403
      res.end('{"error":"nope"}')
    })

    await expect(createApi(creds).call('resetRakun')).rejects.toThrow(
      /does not expose the channel "resetRakun"/
    )
  })

  test('nothing listening says rakun may be stopped', async () => {
    await expect(
      createApi({ port: 1, token: 'x' }).call('getLibrary')
    ).rejects.toThrow(/rakun is stopped/)
  })
})

describe('events', () => {
  test('yields events split across chunks and skips pings', async () => {
    const creds = await listen((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write(': connected\n\nevent: refreshLibrary\nda')
      setTimeout(() => {
        res.write(
          'ta: ["gog"]\n\n: ping\n\nevent: pushGameToLibrary\ndata: []\n\n'
        )
        res.end()
      }, 20)
    })

    const received = []
    for await (const event of await createApi(creds).events()) {
      received.push(event)
    }

    expect(received).toEqual([
      { event: 'refreshLibrary', args: ['gog'] },
      { event: 'pushGameToLibrary', args: [] }
    ])
  })

  test('a rejected token fails before streaming', async () => {
    const creds = await listen((req, res) => {
      res.statusCode = 401
      res.end('{"error":"invalid"}')
    })

    await expect(createApi(creds).events()).rejects.toThrow(/token/)
  })
})
