import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { CliError } from '../client'
import { checkServe, runCli } from '../cli'
import {
  relicdCommand,
  relicdFlags,
  startRelicd,
  stop
} from '../commands/service'
import { opts } from './helpers'

describe('relicdCommand', () => {
  test('uses the launcher that sits beside relicctl', () => {
    const dir = mkdtempSync(join(tmpdir(), 'relicd-cmd-'))
    writeFileSync(join(dir, 'relicd'), '')
    expect(relicdCommand(dir)).toEqual({ cmd: join(dir, 'relicd'), args: [] })
  })

  test('from the checkout it runs relicd.cjs with node', () => {
    const dir = mkdtempSync(join(tmpdir(), 'relicd-cmd-'))
    expect(relicdCommand(dir)).toEqual({
      cmd: process.execPath,
      args: [join(dir, 'relicd.cjs')]
    })
  })
})

describe('relicdFlags', () => {
  test('forwards --web and --port to relicd, which checks them', () => {
    expect(relicdFlags({ web: 'network', port: '18000' })).toEqual([
      '--web=network',
      '--port=18000'
    ])
    expect(relicdFlags({ web: 'off' })).toEqual(['--web=off'])
    expect(relicdFlags({})).toEqual([])
  })
})

describe('startRelicd', () => {
  test('answers with the pid it started', async () => {
    const pid = await startRelicd(
      () => ({ pid: 4321, exited: () => undefined }),
      () => Promise.resolve(true)
    )
    expect(pid).toBe(4321)
  })

  test('says nothing when another relicd got there first', async () => {
    const pid = await startRelicd(
      () => ({ pid: 4321, exited: () => 1 }),
      () => Promise.resolve(true)
    )
    expect(pid).toBeUndefined()
  })

  test('fails and points to the logs when relicd dies', async () => {
    await expect(
      startRelicd(
        () => ({ pid: 4321, exited: () => 1 }),
        () => Promise.resolve(false)
      )
    ).rejects.toThrow(/relicctl logs/)
  })
})

describe('with relicd stopped', () => {
  const previous = process.env.RELICD_API_FILE
  beforeAll(() => {
    process.env.RELICD_API_FILE = '/no/such/api.json'
  })
  afterAll(() => {
    if (previous === undefined) delete process.env.RELICD_API_FILE
    else process.env.RELICD_API_FILE = previous
  })

  test('stop says it is already stopped', async () => {
    const lines: string[] = []
    await stop({ log: (line) => lines.push(line) }, {})
    expect(lines).toEqual(['relicd ya está parado'])
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
      'relicd parado; arráncalo con "relicctl start"',
      '{"running":false}'
    ])
  })

  test('any other command says so too', async () => {
    const io = { log: () => undefined, ask: () => Promise.resolve('') }
    await expect(runCli(['queue'], io)).rejects.toThrow(/relicctl start/)
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
