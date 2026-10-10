import { chmodSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checkServe, parseCli } from '../cli'
import { CliError } from '../client'
import {
  Deps,
  fetchLatest,
  installDir,
  isNewer,
  isOwnInstall,
  parseRelease,
  runInstaller,
  selfUpdate
} from '../commands/selfupdate'
import { opts } from './helpers'

const URL = 'https://example.test/rakun-0.3.0-linux-x64.tar.gz'
const release = {
  tag_name: 'v0.3.0',
  assets: [
    { name: 'rakun-0.3.0-linux-x64.tar.gz.sha256', browser_download_url: 'x' },
    { name: 'rakun-0.3.0-linux-x64.tar.gz', browser_download_url: URL }
  ]
}

function fakeDeps(over: Partial<Deps> = {}) {
  const calls: string[] = []
  const deps: Deps = {
    dir: installDir(),
    arch: 'x64',
    current: '0.2.0',
    latest: () => Promise.resolve({ version: '0.3.0', url: URL }),
    running: () => Promise.resolve(false),
    stop: () => {
      calls.push('stop')
      return Promise.resolve()
    },
    start: () => {
      calls.push('start')
      return Promise.resolve()
    },
    serviceInstalled: () => false,
    startService: () => {
      calls.push('startService')
      return Promise.resolve()
    },
    install: (url) => {
      calls.push(`install ${url}`)
      return Promise.resolve()
    },
    helpersLine: () => Promise.resolve('Helpers: all installed'),
    ...over
  }
  const lines: string[] = []
  return { deps, calls, lines, ctx: { log: (l: string) => lines.push(l) } }
}

describe('isNewer', () => {
  test('compares the three numbers, not the text', () => {
    expect(isNewer('0.3.0', '0.2.0')).toBe(true)
    expect(isNewer('0.10.0', '0.9.0')).toBe(true)
    expect(isNewer('1.0.0', '0.99.99')).toBe(true)
    expect(isNewer('0.2.0', '0.2.0')).toBe(false)
    expect(isNewer('0.1.9', '0.2.0')).toBe(false)
  })
})

describe('parseRelease', () => {
  test('gives the version and the tarball of the published build', () => {
    expect(parseRelease(release)).toEqual({ version: '0.3.0', url: URL })
  })

  test('refuses a tag that is not vX.Y.Z', () => {
    expect(() => parseRelease({ ...release, tag_name: 'v0.3.0-rc1' })).toThrow(
      CliError
    )
    expect(() => parseRelease({})).toThrow('unexpected tag')
  })

  test('refuses a release that has no tarball for x64', () => {
    expect(() => parseRelease({ tag_name: 'v0.3.0', assets: [] })).toThrow(
      'has no rakun-0.3.0-linux-x64.tar.gz'
    )
  })
})

describe('fetchLatest', () => {
  const answer = (status: number, body: unknown = release) =>
    (() =>
      Promise.resolve({
        ok: status === 200,
        status,
        json: () => Promise.resolve(body)
      })) as unknown as typeof fetch

  test('reads the latest release', async () => {
    await expect(fetchLatest('u', answer(200))).resolves.toEqual({
      version: '0.3.0',
      url: URL
    })
  })

  test('says so when GitHub refuses (rate limit) or fails', async () => {
    await expect(fetchLatest('u', answer(403))).rejects.toThrow('refused')
    await expect(fetchLatest('u', answer(500))).rejects.toThrow('HTTP 500')
  })

  test('says so when there is no network', async () => {
    const offline = (() =>
      Promise.reject(new Error('ENOTFOUND'))) as typeof fetch
    await expect(fetchLatest('u', offline)).rejects.toThrow(
      'Could not reach GitHub'
    )
  })
})

describe('isOwnInstall', () => {
  test('is only the folder install.sh installs into', () => {
    expect(isOwnInstall('/home/u/.local/opt/rakun', '/home/u')).toBe(true)
    expect(isOwnInstall('/home/u/.local/opt/rakun/', '/home/u')).toBe(true)
    expect(isOwnInstall('/home/u/rakun/build', '/home/u')).toBe(false)
    expect(isOwnInstall('/tmp/.mount_x/usr/bin', '/home/u')).toBe(false)
  })
})

describe('selfUpdate', () => {
  test('refuses an install that is not install.sh’s, touching nothing', async () => {
    const { deps, calls, ctx } = fakeDeps({ dir: '/tmp/appimage' })
    await expect(selfUpdate(ctx, {}, false, deps)).rejects.toThrow(
      'not installed by install.sh'
    )
    expect(calls).toEqual([])
  })

  test('refuses where no build is published', async () => {
    const { deps, ctx } = fakeDeps({ arch: 'arm64' })
    await expect(selfUpdate(ctx, {}, false, deps)).rejects.toThrow(
      'no published build for arm64'
    )
  })

  test('--check says there is a new version and installs nothing', async () => {
    const { deps, calls, lines, ctx } = fakeDeps()
    await selfUpdate(ctx, { check: true }, false, deps)
    expect(lines).toEqual([
      'rakun 0.3.0 is available (you have 0.2.0): run "rakunctl self-update"'
    ])
    expect(calls).toEqual([])
  })

  test('--check --json gives the three facts', async () => {
    const { deps, lines, ctx } = fakeDeps()
    await selfUpdate(ctx, { check: true }, true, deps)
    expect(JSON.parse(lines[0])).toEqual({
      current: '0.2.0',
      latest: '0.3.0',
      updateAvailable: true
    })
  })

  test('with the newest version it does nothing', async () => {
    const { deps, calls, lines, ctx } = fakeDeps({ current: '0.3.0' })
    await selfUpdate(ctx, {}, false, deps)
    expect(lines).toEqual(['rakun 0.3.0 is up to date'])
    expect(calls).toEqual([])
  })

  test('with rakun stopped it installs and does not start it', async () => {
    const { deps, calls, lines, ctx } = fakeDeps()
    await selfUpdate(ctx, {}, false, deps)
    expect(calls).toEqual([`install ${URL}`])
    expect(lines).toContain('rakun 0.3.0 installed')
  })

  test('with rakun running it stops it, installs and starts it again', async () => {
    const { deps, calls, lines, ctx } = fakeDeps({
      running: () => Promise.resolve(true)
    })
    await selfUpdate(ctx, {}, false, deps)
    expect(calls).toEqual(['stop', `install ${URL}`, 'start'])
    expect(lines).toContain('Helpers: all installed')
  })

  test('with the service installed it starts the service, not rakun', async () => {
    const { deps, calls, ctx } = fakeDeps({
      running: () => Promise.resolve(true),
      serviceInstalled: () => true
    })
    await selfUpdate(ctx, {}, false, deps)
    expect(calls).toEqual(['stop', `install ${URL}`, 'startService'])
  })

  test('a rakun that is busy stops nothing and installs nothing', async () => {
    const { deps, calls, ctx } = fakeDeps({
      running: () => Promise.resolve(true),
      stop: () => Promise.reject(new CliError('rakun is downloading'))
    })
    await expect(selfUpdate(ctx, {}, false, deps)).rejects.toThrow(
      'downloading'
    )
    expect(calls).toEqual([])
  })

  test('if the install fails the old rakun runs again and the error comes out', async () => {
    const { deps, calls, ctx } = fakeDeps({
      running: () => Promise.resolve(true),
      install: () => Promise.reject(new CliError('the checksum does not match'))
    })
    await expect(selfUpdate(ctx, {}, false, deps)).rejects.toThrow('checksum')
    expect(calls).toEqual(['stop', 'start'])
  })

  test('if the install fails with rakun stopped nothing is started', async () => {
    const { deps, calls, ctx } = fakeDeps({
      install: () => Promise.reject(new CliError('boom'))
    })
    await expect(selfUpdate(ctx, {}, false, deps)).rejects.toThrow('boom')
    expect(calls).toEqual([])
  })
})

describe('runInstaller', () => {
  const script = (body: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'rakun-selfupdate-'))
    const file = join(dir, 'install.sh')
    writeFileSync(file, `#!/bin/bash\n${body}\n`)
    chmodSync(file, 0o755)
    return dir
  }

  test('runs install.sh with the address and passes on what it says', async () => {
    const lines: string[] = []
    const dir = script('echo "got $1"; echo "self=$RAKUN_SELF_UPDATE"')
    await runInstaller(dir, URL, (l) => lines.push(l))
    expect(lines).toEqual([`got ${URL}`, 'self=1'])
  })

  test('fails with the code and what it said when install.sh fails', async () => {
    const lines: string[] = []
    const dir = script('echo "Error: the checksum does not match." >&2; exit 1')
    await expect(runInstaller(dir, URL, (l) => lines.push(l))).rejects.toThrow(
      'failed (code 1)'
    )
    expect(lines).toEqual(['Error: the checksum does not match.'])
  })

  test('says what to do when this version has no install.sh', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rakun-selfupdate-'))
    await expect(runInstaller(dir, URL, () => undefined)).rejects.toThrow(
      'has no self-update'
    )
  })
})

describe('the command line', () => {
  test('--check is an option of self-update', () => {
    expect(parseCli(['self-update', '--check']).opts.check).toBe(true)
    expect(parseCli(['self-update']).opts.check).toBeUndefined()
  })

  test('-s cannot be used with it: it does not need rakun', () => {
    expect(() => checkServe('self-update', opts)).toThrow(CliError)
  })
})
