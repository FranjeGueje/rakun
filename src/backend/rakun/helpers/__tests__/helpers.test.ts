import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { downloadHelpers, latestTag, sha256Of } from '../download'
import { helperStates, installFromBundle, readTags, recordTag } from '../files'
import {
  ASSETS,
  assetsOf,
  expectedFiles,
  HELPERS,
  RELEASE_TAGS,
  releaseUrl,
  type Layout
} from '../manifest'

const dirs: string[] = []
function layout(): Layout {
  const root = mkdtempSync(join(tmpdir(), 'rakun-helpers-'))
  dirs.push(root)
  return { binRoot: join(root, 'bin'), winRoot: join(root, 'mount', 'bin') }
}
afterAll(() =>
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }))
)

function put(path: string, content = 'x') {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

/** Puts every file the helpers of x64 need */
function installAll(l: Layout) {
  for (const helper of HELPERS) {
    for (const { root, file } of expectedFiles(helper, 'x64'))
      put(join(root === 'win' ? l.winRoot : l.binRoot, file))
    recordTag(l.binRoot, helper, RELEASE_TAGS[helper])
  }
}

describe('the manifest', () => {
  test('every download that can be checked has a sha256 of 64 hex digits', () => {
    for (const asset of ASSETS) expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  test('every helper that is downloaded from GitHub has its assets, except Zoom (a script)', () => {
    for (const helper of HELPERS.filter((h) => h !== 'zoom-platform'))
      expect(assetsOf(helper, ['x64', 'arm64']).length).toBeGreaterThan(0)
    expect(assetsOf('zoom-platform', ['x64'])).toEqual([])
  })

  test('the Linux tools of the other architecture are not downloaded', () => {
    const arm = assetsOf('legendary', ['arm64']).map((a) => a.target)
    expect(arm).toContain('arm64/linux/legendary')
    expect(arm).not.toContain('x64/linux/legendary')
    expect(arm).toContain('legendary.exe')
  })

  test('the url is the release of the tag', () => {
    const asset = assetsOf('umu', ['x64'])[0]
    expect(releaseUrl('umu', '1.4.4', asset)).toBe(
      'https://github.com/Open-Wine-Components/umu-launcher/releases/download/1.4.4/umu-launcher-1.4.4-zipapp.tar'
    )
  })

  test('the files a helper leaves are the ones the rest of rakun looks for', () => {
    expect(expectedFiles('legendary', 'arm64')).toEqual([
      { root: 'bin', file: 'arm64/linux/legendary' },
      { root: 'win', file: 'legendary.exe' }
    ])
    expect(expectedFiles('comet', 'x64').map((e) => e.file)).toContain(
      'install-dummy-service.bat'
    )
  })
})

describe('helperStates', () => {
  test('with nothing installed, every helper is missing', () => {
    const states = helperStates(layout(), { arch: 'x64' })
    expect(states.map((s) => s.state)).toEqual(HELPERS.map(() => 'missing'))
    expect(states[0]).toMatchObject({
      helper: 'legendary',
      pinned: '0.21.1',
      installed: ''
    })
  })

  test('with the files and the pinned tags, everything is ok', () => {
    const l = layout()
    installAll(l)
    expect(
      helperStates(l, { arch: 'x64' }).every((s) => s.state === 'ok')
    ).toBe(true)
  })

  test('another version is «other», and one file less is «missing»', () => {
    const l = layout()
    installAll(l)
    recordTag(l.binRoot, 'nile', 'v9.9.9')
    rmSync(join(l.winRoot, 'gogdl.exe'))
    const byName = Object.fromEntries(
      helperStates(l, { arch: 'x64' }).map((s) => [s.helper, s])
    )
    expect(byName.nile).toMatchObject({ state: 'other', installed: 'v9.9.9' })
    expect(byName.gogdl.state).toBe('missing')
    expect(byName.legendary.state).toBe('ok')
  })

  test('the Linux tools of a full tarball count, with its tags', () => {
    const l = layout()
    const bundle = join(l.binRoot, '..', 'bundle')
    put(join(bundle, 'x64', 'linux', 'nile'))
    recordTag(bundle, 'nile', RELEASE_TAGS.nile)
    // The Windows file is in the mount, put there by installFromBundle
    put(join(l.winRoot, 'nile.exe'))
    const nile = helperStates(l, { arch: 'x64', bundleBinRoot: bundle }).find(
      (s) => s.helper === 'nile'
    )
    expect(nile?.state).toBe('ok')
  })
})

describe('installFromBundle', () => {
  function bundleWith(tag: string, content: string) {
    const l = layout()
    const bundle = join(l.binRoot, '..', 'bundle')
    for (const { file } of expectedFiles('legendary', 'x64').filter(
      (e) => e.root === 'win'
    ))
      put(join(bundle, 'x64', 'win32', file), content)
    recordTag(bundle, 'legendary', tag)
    return { l, bundle }
  }

  test('copies the Windows files that are not in the mount and notes their version', () => {
    const { l, bundle } = bundleWith('0.21.1', 'from the bundle')

    expect(installFromBundle(l, bundle)).toEqual(['legendary'])
    expect(readFileSync(join(l.winRoot, 'legendary.exe'), 'utf-8')).toBe(
      'from the bundle'
    )
    expect(readTags(l.binRoot).legendary).toBe('0.21.1')
  })

  test('does not touch what is already there at the version of the bundle', () => {
    const { l, bundle } = bundleWith('0.21.1', 'from the bundle')
    installFromBundle(l, bundle)
    writeFileSync(join(l.winRoot, 'legendary.exe'), 'mine')

    expect(installFromBundle(l, bundle)).toEqual([])
    expect(readFileSync(join(l.winRoot, 'legendary.exe'), 'utf-8')).toBe('mine')
  })

  test('a new version of the bundle replaces the old one', () => {
    const { l, bundle } = bundleWith('0.22.0', 'new')
    put(join(l.winRoot, 'legendary.exe'), 'old')
    recordTag(l.binRoot, 'legendary', '0.21.1')

    expect(installFromBundle(l, bundle)).toEqual(['legendary'])
    expect(readFileSync(join(l.winRoot, 'legendary.exe'), 'utf-8')).toBe('new')
  })

  test('with no bundle there is nothing to copy', () => {
    const l = layout()
    expect(installFromBundle(l, join(l.binRoot, 'none'))).toEqual([])
  })
})

describe('downloadHelpers', () => {
  const payload = Buffer.from('a binary')

  /** Answers every url with `payload`, and the Zoom script with its own */
  function fakeFetch(body: Buffer = payload, status = 200) {
    return jest.fn((url: string | URL | Request) =>
      Promise.resolve(
        String(url).includes('zoom-platform.sh')
          ? new Response('INSTALLER_VERSION="2.0"\n')
          : new Response(new Uint8Array(body), { status })
      )
    ) as unknown as typeof fetch
  }

  test('a file whose sha256 is not the pinned one is refused and leaves nothing', async () => {
    const l = layout()
    const failures = await downloadHelpers(l, {
      only: ['epic-integration'],
      fetchFn: fakeFetch()
    })

    expect(failures).toHaveLength(1)
    expect(failures[0].error).toMatch(/sha256/)
    expect(existsSync(join(l.winRoot, 'EpicGamesLauncher.exe'))).toBe(false)
    expect(existsSync(join(l.winRoot, 'EpicGamesLauncher.exe.part'))).toBe(
      false
    )
    expect(readTags(l.binRoot).legendary).toBeUndefined()
  })

  test('a file that matches is saved, in the folder of its root, and the tag noted', async () => {
    const l = layout()
    const asset = ASSETS.find((a) => a.target === 'EpicGamesLauncher.exe')!
    const original = asset.sha256
    asset.sha256 = sha256Of(payload)
    try {
      const failures = await downloadHelpers(l, {
        only: ['epic-integration'],
        fetchFn: fakeFetch()
      })
      expect(failures).toEqual([])
    } finally {
      asset.sha256 = original
    }

    expect(readFileSync(join(l.winRoot, 'EpicGamesLauncher.exe'))).toEqual(
      payload
    )
    expect(readTags(l.binRoot)['epic-integration']).toBe('v0.4')
  })

  test('the Linux tools get the execute permission, the Windows ones do not', async () => {
    const l = layout()
    const assets = ASSETS.filter(
      (a) => a.helper === 'nile' && (a.arch === 'x64' || a.root === 'win')
    )
    const originals = assets.map((a) => a.sha256)
    assets.forEach((a) => (a.sha256 = sha256Of(payload)))
    try {
      await downloadHelpers(l, {
        only: ['nile'],
        arches: ['x64'],
        fetchFn: fakeFetch()
      })
    } finally {
      assets.forEach((a, i) => (a.sha256 = originals[i]))
    }

    expect(
      statSync(join(l.binRoot, 'x64', 'linux', 'nile')).mode & 0o111
    ).not.toBe(0)
    expect(statSync(join(l.winRoot, 'nile.exe')).mode & 0o111).toBe(0)
    chmodSync(join(l.binRoot, 'x64', 'linux', 'nile'), 0o644)
  })

  test('a failure does not stop the other helpers', async () => {
    const l = layout()
    const progress: string[] = []
    const failures = await downloadHelpers(l, {
      only: ['epic-integration', 'zoom-platform'],
      fetchFn: fakeFetch(),
      onProgress: (line) => progress.push(line)
    })

    expect(failures.map((f) => f.helper)).toEqual(['epic-integration'])
    expect(existsSync(join(l.binRoot, 'zoom', 'zoom-platform.sh'))).toBe(true)
    // The Zoom script has no pin: the version it says is the one noted
    expect(readTags(l.binRoot)['zoom-platform']).toBe('2.0')
  })

  test('by default only what is missing or of another version is downloaded', async () => {
    const l = layout()
    installAll(l)
    const fetchFn = fakeFetch()
    const progress: string[] = []

    expect(
      await downloadHelpers(l, {
        fetchFn,
        onProgress: (line) => progress.push(line)
      })
    ).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
    expect(progress).toEqual([
      'Nothing to download: the helpers are up to date'
    ])
  })

  test('--latest asks for the newest tag and does not check the hash', async () => {
    const l = layout()
    const calls: string[] = []
    const fetchFn = jest.fn((url: string | URL | Request) => {
      calls.push(String(url))
      return Promise.resolve(
        String(url).includes('/releases/latest')
          ? new Response(JSON.stringify({ tag_name: 'v7.7.7' }))
          : new Response(new Uint8Array(payload))
      )
    }) as unknown as typeof fetch

    const failures = await downloadHelpers(l, {
      latest: true,
      only: ['epic-integration'],
      fetchFn
    })

    expect(failures).toEqual([])
    expect(calls).toContain(
      'https://github.com/BananaWorks07/heroic-epic-integration/releases/download/v7.7.7/EpicGamesLauncher.exe'
    )
    expect(readTags(l.binRoot)['epic-integration']).toBe('v7.7.7')
  })

  test('latestTag fails with a readable message', async () => {
    const fetchFn = jest.fn(() =>
      Promise.resolve(new Response('no', { status: 403 }))
    ) as unknown as typeof fetch
    await expect(latestTag('a/b', fetchFn)).rejects.toThrow('HTTP 403 (a/b)')
  })
})
