import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checkServe } from '../cli'
import {
  checkFlags,
  installService,
  savedWebAccess,
  systemdQuote,
  unitText,
  uninstallService
} from '../commands/systemd'
import { unitPath } from '../commands/unit'
import { opts } from './helpers'

const tmp = () => mkdtempSync(join(tmpdir(), 'rakun-systemd-'))

function recorder() {
  const calls: string[][] = []
  const lines: string[] = []
  return {
    calls,
    lines,
    ctl: (args: string[]) => {
      calls.push(args)
      return Promise.resolve()
    },
    log: (line: string) => lines.push(line)
  }
}

describe('unitPath', () => {
  test('is the units folder of the user, in XDG_CONFIG_HOME or ~/.config', () => {
    expect(unitPath({ XDG_CONFIG_HOME: '/x' })).toBe(
      '/x/systemd/user/rakun.service'
    )
    expect(unitPath({})).toMatch(/\.config\/systemd\/user\/rakun\.service$/)
  })
})

describe('systemdQuote', () => {
  test('quotes a word and escapes what systemd would interpret', () => {
    expect(systemdQuote('/a b/rakun')).toBe('"/a b/rakun"')
    expect(systemdQuote('a"b\\c%d')).toBe('"a\\"b\\\\c%%d"')
  })
})

describe('unitText', () => {
  test('restarts only on failure, so that `rakunctl stop` really stops it', () => {
    const text = unitText({ cmd: '/opt/rakun/rakun', args: [] })
    expect(text).toContain('ExecStart="/opt/rakun/rakun"\n')
    expect(text).toContain('Restart=on-failure')
    expect(text).toContain('WantedBy=default.target')
  })

  test('from the checkout it runs node with rakun.cjs', () => {
    expect(unitText({ cmd: '/n/node', args: ['/b/rakun.cjs'] })).toContain(
      'ExecStart="/n/node" "/b/rakun.cjs"'
    )
  })
})

describe('savedWebAccess', () => {
  test('reads the saved setting, or nothing when there is no config', () => {
    const file = join(tmp(), 'config.json')
    expect(savedWebAccess(file)).toBe('')
    writeFileSync(file, '{"defaultSettings":{"webAccess":"network"}}')
    expect(savedWebAccess(file)).toBe('network')
    writeFileSync(
      file,
      '{"defaultSettings":{"webAccess":"network"},"settings":{"webAccess":"off"}}'
    )
    expect(savedWebAccess(file)).toBe('off')
  })
})

describe('installService', () => {
  test('writes the unit, reloads and enables it now', async () => {
    const r = recorder()
    const file = join(tmp(), 'user', 'rakun.service')
    await installService(
      r,
      {},
      {
        file,
        dir: tmp(),
        ctl: r.ctl,
        running: () => Promise.resolve(false),
        web: () => 'local'
      }
    )
    expect(readFileSync(file, 'utf-8')).toContain('Restart=on-failure')
    expect(r.calls).toEqual([
      ['daemon-reload'],
      ['enable', '--now', 'rakun.service']
    ])
    expect(r.lines.join('\n')).toMatch(/Zoom/)
    expect(r.lines.join('\n')).not.toMatch(/WITHOUT protection/)
  })

  test('with rakun already running it only enables the unit', async () => {
    const r = recorder()
    await installService(
      r,
      {},
      {
        file: join(tmp(), 'rakun.service'),
        dir: tmp(),
        ctl: r.ctl,
        running: () => Promise.resolve(true),
        web: () => 'local'
      }
    )
    expect(r.calls[1]).toEqual(['enable', 'rakun.service'])
  })

  test('--web and --port go to the unit, and --web network warns', async () => {
    const r = recorder()
    const file = join(tmp(), 'rakun.service')
    await installService(
      r,
      { web: 'network', port: '18000' },
      {
        file,
        dir: tmp(),
        ctl: r.ctl,
        running: () => Promise.resolve(false),
        web: () => 'local'
      }
    )
    expect(readFileSync(file, 'utf-8')).toMatch(
      /ExecStart=.*"--web=network" "--port=18000"\n/
    )
    expect(r.lines.join('\n')).toMatch(/WITHOUT protection/)
  })

  test('refuses a bad --web or --port before writing anything', async () => {
    const r = recorder()
    const file = join(tmp(), 'rakun.service')
    await expect(installService(r, { web: 'lan' }, { file })).rejects.toThrow(
      /--web/
    )
    await expect(installService(r, { port: '0' }, { file })).rejects.toThrow(
      /--port/
    )
    expect(existsSync(file)).toBe(false)
    expect(() => checkFlags({ web: 'off', port: '17370' })).not.toThrow()
  })

  test('warns when the saved setting opens the web to the network', async () => {
    const r = recorder()
    await installService(
      r,
      {},
      {
        file: join(tmp(), 'rakun.service'),
        dir: tmp(),
        ctl: r.ctl,
        running: () => Promise.resolve(false),
        web: () => 'network'
      }
    )
    expect(r.lines.join('\n')).toMatch(/WITHOUT protection/)
  })
})

describe('uninstallService', () => {
  test('stops, disables and removes the unit', async () => {
    const r = recorder()
    const file = join(tmp(), 'rakun.service')
    writeFileSync(file, '')
    await uninstallService(r, { file, ctl: r.ctl })
    expect(r.calls).toEqual([
      ['disable', '--now', 'rakun.service'],
      ['daemon-reload']
    ])
    expect(existsSync(file)).toBe(false)
  })

  test('does nothing when it was never installed', async () => {
    const r = recorder()
    await uninstallService(r, { file: join(tmp(), 'no.service'), ctl: r.ctl })
    expect(r.calls).toEqual([])
    expect(r.lines).toEqual(['The service is not installed'])
  })
})

describe('checkServe', () => {
  test('-s is refused with the service commands', () => {
    expect(() => checkServe('install-service', opts)).toThrow(
      /-s cannot be used/
    )
    expect(() => checkServe('uninstall-service', opts)).toThrow(
      /-s cannot be used/
    )
  })
})
