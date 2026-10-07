import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { CliError } from '../client'
import { checkServe, runCli } from '../cli'
import {
  logFile,
  rakunCommand,
  rakunFlags,
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
