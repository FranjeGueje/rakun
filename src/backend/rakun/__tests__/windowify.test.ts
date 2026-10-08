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
  rakunMountPath: '/mock/mount',
  rakunInstallPath: '/mock/games',
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

import { eosOverlayScriptText } from '../eos_overlay_script'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'

const mockedExistsSync = jest.mocked(existsSync)
const mockedMkdirSync = jest.mocked(mkdirSync)
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
      'Rakun'
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
      'Rakun'
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

describe('createEosOverlayBat', () => {
  function writtenBat() {
    const { createEosOverlayBat } = freshWindowify()
    const path = createEosOverlayBat()
    const call = mockedWriteFileSync.mock.calls.find(
      ([target]) => String(target) === path
    )
    return { path, content: String(call?.[1]) }
  }

  test('writes the script into the scripts folder of the mount, reachable as c:\\Launchers\\scripts inside the prefix', () => {
    const { path } = writtenBat()

    expect(path).toBe('/mock/mount/scripts/eos-overlay.bat')
    expect(mockedMkdirSync).toHaveBeenCalledWith('/mock/mount/eos', {
      recursive: true
    })
    expect(mockedMkdirSync).toHaveBeenCalledWith('/mock/mount/scripts', {
      recursive: true
    })
  })

  test('removes the copy that sat in the root of the mount before the scripts folder', () => {
    writtenBat()

    expect(rmSync).toHaveBeenCalledWith('/mock/mount/eos-overlay.bat', {
      force: true
    })
  })

  test('writes what eosOverlayScriptText makes', () => {
    const { content } = writtenBat()

    expect(content).toBe(eosOverlayScriptText())
  })
})
