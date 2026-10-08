import { createServer, type Server } from 'http'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { CliError } from '../client'
import { checkServe, runCli } from '../cli'
import {
  logFile,
  rakunCommand,
  rakunFlags,
  start,
  startRakun,
  stop
} from '../commands/service'
import { opts } from './helpers'

describe('rakunCommand', () => {
  test('uses the launcher that sits beside rakunctl', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rakun-cmd-'))
    writeFileSync(join(dir, 'rakun'), '')
    expect(rakunCommand(dir)).toEqual({ cmd: join(dir, 'rakun'), args: [] })
  })

  test('from the checkout it runs rakun.cjs with node', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rakun-cmd-'))
    expect(rakunCommand(dir)).toEqual({
      cmd: process.execPath,
      args: [join(dir, 'rakun.cjs')]
    })
  })
})

describe('logFile', () => {
  test('is the log of rakun, in the XDG state folder or in ~/.local/state', () => {
    expect(logFile({ XDG_STATE_HOME: '/x/state' })).toBe(
      '/x/state/Rakun/logs/rakun.log'
    )
    expect(logFile({})).toMatch(/\.local\/state\/Rakun\/logs\/rakun\.log$/)
  })
})

describe('rakunFlags', () => {
  test('forwards --web and --port to rakun, which checks them', () => {
    expect(rakunFlags({ web: 'network', port: '18000' })).toEqual([
      '--web=network',
      '--port=18000'
    ])
    expect(rakunFlags({ web: 'off' })).toEqual(['--web=off'])
    expect(rakunFlags({})).toEqual([])
  })
})

describe('startRakun', () => {
  test('answers with the pid it started', async () => {
    const pid = await startRakun(
      () => ({ pid: 4321, exited: () => undefined }),
      () => Promise.resolve(true)
    )
    expect(pid).toBe(4321)
  })

  test('says nothing when another rakun got there first', async () => {
    const pid = await startRakun(
      () => ({ pid: 4321, exited: () => 1 }),
      () => Promise.resolve(true)
    )
    expect(pid).toBeUndefined()
  })

  test('fails and points to the logs when rakun dies', async () => {
    await expect(
      startRakun(
        () => ({ pid: 4321, exited: () => 1 }),
        () => Promise.resolve(false)
      )
    ).rejects.toThrow(/rakun\.log/)
  })
})

describe('with rakun stopped', () => {
  const previous = process.env.RAKUN_API_FILE
  beforeAll(() => {
    process.env.RAKUN_API_FILE = '/no/such/api.json'
  })
  afterAll(() => {
    if (previous === undefined) delete process.env.RAKUN_API_FILE
    else process.env.RAKUN_API_FILE = previous
  })

  test('stop says it is already stopped', async () => {
    const lines: string[] = []
    await stop({ log: (line) => lines.push(line) }, {})
    expect(lines).toEqual(['rakun is already stopped'])
  })

  test('status reports it as stopped, also for scripts', async () => {
    const lines: string[] = []
    const io = {
      log: (line: string) => lines.push(line),
      ask: () => Promise.resolve('')
    }
    await runCli(['status'], io)
    await runCli(['status', '--json'], io)
    expect(lines).toEqual([
      'rakun is stopped; start it with "rakunctl start"',
      '{"running":false}'
    ])
  })

  test('any other command says so too', async () => {
    const io = { log: () => undefined, ask: () => Promise.resolve('') }
    await expect(runCli(['queue'], io)).rejects.toThrow(/rakunctl start/)
  })
})

describe('checkServe', () => {
  test('refuses what never ends or outlives the command', () => {
    expect(() => checkServe('events', opts)).toThrow(CliError)
    expect(() => checkServe('install', { ...opts, wait: false })).toThrow(
      /--no-wait/
    )
    expect(() => checkServe('start', opts)).toThrow(CliError)
    expect(() => checkServe('library', opts)).not.toThrow()
  })
})

/** A rakun that answers: `busy` has a download in the queue; it stops answering after stopRakun */
async function fakeRakun(busy: boolean) {
  const calls: string[] = []
  const server: Server = createServer((req, res) => {
    const channel = req.url?.replace('/api/', '') ?? ''
    if (req.url !== '/health') calls.push(channel)
    const answers: Record<string, unknown> = {
      '/health': { status: 'ok', version: '1.0.0', web: 'local' },
      getDMQueueInformation: {
        elements: busy ? [{ params: { appName: 'g1' } }] : [],
        finished: [],
        state: 'running'
      },
      getRefreshingLibraries: []
    }
    const answer = answers[req.url === '/health' ? '/health' : channel]
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify(
        req.url === '/health' ? answer : { result: answer ?? null }
      )
    )
    if (channel === 'stopRakun') setImmediate(() => server.close())
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const dir = mkdtempSync(join(tmpdir(), 'rakun-api-'))
  const file = join(dir, 'api.json')
  writeFileSync(file, JSON.stringify({ port, token: 'secret' }))
  return { calls, file, dir, close: () => server.close() }
}

describe('with rakun running', () => {
  const previous = process.env.RAKUN_API_FILE
  const previousConfig = process.env.XDG_CONFIG_HOME
  let rakun: Awaited<ReturnType<typeof fakeRakun>>

  afterEach(() => {
    rakun?.close()
    if (previous === undefined) delete process.env.RAKUN_API_FILE
    else process.env.RAKUN_API_FILE = previous
    if (previousConfig === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousConfig
  })

  async function running(busy: boolean, serviceInstalled = false) {
    rakun = await fakeRakun(busy)
    process.env.RAKUN_API_FILE = rakun.file
    // The folder where systemd units are looked for: with or without ours
    process.env.XDG_CONFIG_HOME = rakun.dir
    if (serviceInstalled) {
      mkdirSync(join(rakun.dir, 'systemd', 'user'), { recursive: true })
      writeFileSync(join(rakun.dir, 'systemd', 'user', 'rakun.service'), '')
    }
  }

  test('start says it is already running and starts nothing', async () => {
    await running(false)
    const lines: string[] = []

    await start({ log: (line) => lines.push(line) })

    expect(lines).toEqual(['rakun is already running'])
  })

  test('stop does not cut a download: it says so and asks for --force', async () => {
    await running(true)

    await expect(stop({ log: () => undefined }, {})).rejects.toThrow(
      /downloading or refreshing the library.*--force/
    )
    expect(rakun.calls).not.toContain('stopRakun')
  })

  test('stop --force stops it even with a download', async () => {
    await running(true)
    const lines: string[] = []

    await stop({ log: (line) => lines.push(line) }, { force: true })

    expect(rakun.calls).toContain('stopRakun')
    expect(lines).toEqual(['rakun stopped'])
  })

  test('stop says that an installed service will start it again at the next login', async () => {
    await running(false, true)
    const lines: string[] = []

    await stop({ log: (line) => lines.push(line) }, {})

    expect(lines).toEqual([
      'rakun stopped',
      'The service is still installed: it will start at your next login'
    ])
  })
})
