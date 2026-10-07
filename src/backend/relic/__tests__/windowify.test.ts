jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  readdirSync: jest.fn(),
  rmSync: jest.fn(),
  statSync: jest.fn(),
  symlinkSync: jest.fn(),
  unlinkSync: jest.fn(),
  writeFileSync: jest.fn(),
  copyFileSync: jest.fn()
}))

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn()
}))

jest.mock('backend/constants/paths', () => ({
  relicMountPath: '/mock/mount',
  relicInstallPath: '/mock/games',
  userDataPath: '/mock/userdata',
  publicDir: '/mock/public'
}))

jest.mock('backend/storeManagers/legendary/constants', () => ({
  legendaryConfigPath: '/mock/legendary',
  legendaryInstalled: '/mock/legendary/installed.json'
}))

jest.mock('backend/storeManagers/nile/constants', () => ({
  nileConfigPath: '/mock/nile',
  nileInstalled: '/mock/nile/installed.json'
}))

jest.mock('backend/storeManagers/gog/constants', () => ({
  gogdlConfigPath: '/mock/gogdl'
}))

jest.mock('../steam_shortcuts/add_game', () => ({
  createGameSymlink: jest.fn()
}))

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  copyFileSync
} from 'fs'

const mockedExistsSync = jest.mocked(existsSync)
const mockedMkdirSync = jest.mocked(mkdirSync)
const mockedCopyFileSync = jest.mocked(copyFileSync)
const mockedReaddirSync = jest.mocked(readdirSync)
const mockedStatSync = jest.mocked(statSync)
const mockedWriteFileSync = jest.mocked(writeFileSync)

let logWarning: jest.Mock

beforeEach(() => {
  jest.clearAllMocks()

  mockedExistsSync.mockReturnValue(false)
  mockedReaddirSync.mockReturnValue([])
  mockedStatSync.mockReturnValue({ isFile: () => true } as ReturnType<
    typeof statSync
  >)

  logWarning = jest.mocked(require('backend/logger').logWarning)
})

function freshWindowify() {
  let mod: typeof import('../windowify')
  jest.isolateModules(() => {
    mod = require('../windowify')
  })
  return mod!
}

describe('windowify', () => {
  test('creates mount directories', () => {
    const { windowify } = freshWindowify()

    windowify(
      { title: 'Test', app_name: 'test', runner: 'legendary' } as never,
      '/games/test'
    )

    expect(mockedMkdirSync).toHaveBeenCalled()
  })

  test('warns for unsupported zoom runner', () => {
    const { windowify } = freshWindowify()

    windowify(
      { title: 'Zoom', app_name: 'zoom', runner: 'zoom' } as never,
      '/games/zoom'
    )

    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('windowify not implemented'),
      'Relic'
    )
  })

  test('warns when installed.json is missing', () => {
    const { windowify } = freshWindowify()

    windowify(
      { title: 'Test', app_name: 'test', runner: 'legendary' } as never,
      '/games/test'
    )

    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('No installed.json found'),
      'Relic'
    )
  })

  test('transforms legendary installed.json with windows paths', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([])
    jest
      .mocked(readFileSync)
      .mockReturnValue(
        JSON.stringify({ test: { install_path: '/games/test/game_dir' } })
      )

    const { windowify } = freshWindowify()

    windowify(
      { title: 'Test', app_name: 'test', runner: 'legendary' } as never,
      '/games/test/game_dir'
    )

    expect(mockedWriteFileSync).toHaveBeenCalled()
    const written = JSON.parse(
      (mockedWriteFileSync.mock.calls[0]?.[1] as string) || '{}'
    )
    expect(written.test.install_path).toBe('c:\\games\\game_dir')
  })

  test('transforms gog installed.json with windows paths', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([])
    jest.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        installed: [{ install_path: '/games/gog/game' }]
      })
    )

    const { windowify } = freshWindowify()

    windowify(
      { title: 'GogGame', app_name: 'gog', runner: 'gog' } as never,
      '/games/gog/game'
    )

    expect(mockedWriteFileSync).toHaveBeenCalled()
    const written = JSON.parse(
      (mockedWriteFileSync.mock.calls[0]?.[1] as string) || '{}'
    )
    expect(written.installed[0].install_path).toBe('c:\\games\\game')
  })
})

describe('syncMountBin', () => {
  test('returns early when source directory does not exist', () => {
    const { syncMountBin } = freshWindowify()

    syncMountBin()

    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('source not found'),
      'Relic'
    )
  })

  const file = (size: number, mtimeMs: number) =>
    ({ isFile: () => true, size, mtimeMs }) as ReturnType<typeof statSync>

  /** The source is `source` and the copy in the mount is `copy` (undefined: missing) */
  function syncWith(
    source: ReturnType<typeof statSync>,
    copy: ReturnType<typeof statSync> | undefined
  ) {
    mockedExistsSync.mockImplementation((p: any) => {
      const str = String(p)
      if (str.includes('bin/x64/win32')) return true
      return str.includes('/mount/bin/') && copy !== undefined
    })
    mockedReaddirSync.mockReturnValue(['helper.exe'] as any)
    mockedStatSync.mockImplementation(((p: any) =>
      String(p).includes('/mount/bin/') ? copy : source) as any)

    freshWindowify().syncMountBin()
  }

  test('copies a binary that is missing from the mount', () => {
    syncWith(file(100, 1000), undefined)

    expect(mockedCopyFileSync).toHaveBeenCalledTimes(1)
  })

  test('copies it when the size differs', () => {
    syncWith(file(100, 1000), file(99, 2000))

    expect(mockedCopyFileSync).toHaveBeenCalledTimes(1)
  })

  test('copies it when the source is newer than the copy', () => {
    syncWith(file(100, 3000), file(100, 2000))

    expect(mockedCopyFileSync).toHaveBeenCalledTimes(1)
  })

  test('leaves alone a copy of the same size that is not older', () => {
    syncWith(file(100, 1000), file(100, 1000))
    syncWith(file(100, 1000), file(100, 5000))

    expect(mockedCopyFileSync).not.toHaveBeenCalled()
  })

  test('never reads the binaries to compare them', () => {
    syncWith(file(100, 1000), file(100, 2000))

    expect(readFileSync).not.toHaveBeenCalled()
  })
})

describe('createEosOverlayBat', () => {
  function writtenBat() {
    const { createEosOverlayBat } = freshWindowify()
    const path = createEosOverlayBat()
    const call = mockedWriteFileSync.mock.calls.find(
      ([target]) => String(target) === path
    )
    return { path, content: String(call?.[1]) }
  }

  test('writes the script into the mount root, reachable as c:\\relic inside the prefix', () => {
    const { path } = writtenBat()

    expect(path).toBe('/mock/mount/eos-overlay.bat')
    expect(mockedMkdirSync).toHaveBeenCalledWith('/mock/mount/eos', {
      recursive: true
    })
  })

  test('installs and updates the overlay into c:\\relic\\eos', () => {
    const { content } = writtenBat()

    expect(content).toContain(
      'legendary -y eos-overlay install --path %RELIC%\\eos'
    )
    expect(content).toContain(
      'legendary -y eos-overlay update --path %RELIC%\\eos'
    )
  })

  // Regression guard: install/update bail out with "up to date, nothing to do"
  // once the overlay is recorded in the shared LEGENDARY_CONFIG_PATH, so from
  // the second Epic game onwards only `enable` writes the new prefix registry.
  test('enables the overlay, without which every prefix after the first is left inactive', () => {
    const { content } = writtenBat()

    expect(content).toContain(
      'legendary eos-overlay enable --path %RELIC%\\eos'
    )
  })

  test('points legendary at the shared relic config and bails out if it is missing', () => {
    const { content } = writtenBat()

    expect(content).toContain('set "LEGENDARY_CONFIG_PATH=%RELIC%\\Legendary"')
    expect(content).toContain('if not exist "%RELIC%\\bin\\legendary.exe" (')
  })
})
