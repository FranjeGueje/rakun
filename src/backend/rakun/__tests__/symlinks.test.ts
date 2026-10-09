import { existsSync, unlinkSync, symlinkSync } from 'fs'
import { createRakunSymlinks } from '../windowify'

import { logError } from 'backend/logger'

jest.mock('../steam_shortcuts/add_game', () => ({
  createGameSymlink: jest.fn()
}))

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
  symlinkSync: jest.fn()
}))

jest.mock('backend/storeManagers/legendary/constants', () => ({
  legendaryConfigPath: '/mock/legendary',
  legendaryInstalled: '/mock/legendary/installed.json',
  legendaryMetadata: '/mock/legendary/metadata',
  legendaryUserInfo: '/mock/legendary/user.json',
  thirdPartyInstalled: '/mock/legendary/third-party-installed.json',
  epicRedistPath: '/mock/redist/legendary'
}))

jest.mock('backend/storeManagers/nile/constants', () => ({
  nileConfigPath: '/mock/nile',
  nileInstalled: '/mock/nile/installed.json',
  nileLibrary: '/mock/nile/library.json',
  nileUserData: '/mock/nile/current_user.json'
}))

jest.mock('backend/storeManagers/gog/constants', () => ({
  gogdlConfigPath: '/mock/gogdl',
  gogSupportPath: '/mock/gogdl/gog-support',
  gogdlAuthConfig: '/mock/gog/auth.json'
}))

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn()
}))

jest.mock('backend/constants/environment', () => ({
  isLinux: true,
  isWindows: false,
  isMac: false,
  isFlatpak: false
}))

jest.mock('backend/constants/paths', () => ({
  appFolder: '/mock/rakun',
  userDataPath: '/mock/userdata',
  rakunMountPath: '/mock/mount',
  rakunInstallPath: '/mock/games',
  rakunGamesPath: '/mock/games',
  rakunRunnerPath: '/mock/runner',
  configPath: '/mock/config.json',
  fixesPath: '/mock/fixes',
  publicDir: '/mock/public',
  webviewPreloadPath: '/mock/webview.js',
  windowIcon: '/mock/icon.png',
  fixAsarPath: (s: string): string => s,
  userHome: '/home/user'
}))

const mockedExistsSync = jest.mocked(existsSync)
const mockedUnlinkSync = jest.mocked(unlinkSync)
const mockedSymlinkSync = jest.mocked(symlinkSync)

const LINKS_PATH = '/tmp/rakun-links'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('createRakunSymlinks', () => {
  test('creates symlinks when no existing links present', () => {
    mockedExistsSync.mockReturnValue(false)

    createRakunSymlinks(LINKS_PATH)

    expect(mockedUnlinkSync).not.toHaveBeenCalled()
    expect(mockedSymlinkSync).toHaveBeenCalledTimes(2)
    expect(mockedSymlinkSync).toHaveBeenCalledWith(
      '/mock/mount',
      `${LINKS_PATH}/Launchers`
    )
    expect(mockedSymlinkSync).toHaveBeenCalledWith(
      '/mock/games',
      `${LINKS_PATH}/games`
    )
  })

  test('cleans up existing symlinks before creating new ones', () => {
    mockedExistsSync.mockReturnValue(true)

    createRakunSymlinks(LINKS_PATH)

    expect(mockedUnlinkSync).toHaveBeenCalledTimes(2)
    expect(mockedUnlinkSync).toHaveBeenCalledWith(`${LINKS_PATH}/Launchers`)
    expect(mockedUnlinkSync).toHaveBeenCalledWith(`${LINKS_PATH}/games`)
    expect(mockedSymlinkSync).toHaveBeenCalledTimes(2)
  })

  test('throws and logs error when symlink creation fails', () => {
    mockedExistsSync.mockReturnValue(false)
    mockedSymlinkSync.mockImplementation(() => {
      throw new Error('permission denied')
    })

    expect(() => createRakunSymlinks(LINKS_PATH)).toThrow('permission denied')

    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to create symlinks'),
      'Rakun'
    )
  })
})
