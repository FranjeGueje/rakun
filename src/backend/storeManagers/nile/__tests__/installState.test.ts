jest.mock('backend/logger', () => ({
  LogPrefix: { Nile: 'Nile' },
  logDebug: jest.fn(),
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn()
}))
jest.mock('../electronStores', () => ({
  installStore: { get: jest.fn(), set: jest.fn(), delete: jest.fn() },
  libraryStore: { get: jest.fn(), set: jest.fn() }
}))
jest.mock('backend/utils', () => ({
  getFileSize: jest.fn(),
  getNileBin: jest.fn(() => ({ dir: '/tmp', bin: 'nile' })),
  removeSpecialcharacters: jest.fn((value: string) => value)
}))
jest.mock('backend/runner_call', () => ({ callRunner: jest.fn() }))
jest.mock('backend/constants/paths', () => ({
  appDataPath: '/tmp/appdata',
  userDataPath: '/tmp/userdata',
  appFolder: '/tmp/userdata'
}))
jest.mock('../user', () => ({
  NileUser: { isLoggedIn: jest.fn(), getUserData: jest.fn() }
}))
jest.mock('../constants', () => ({
  nileConfigPath: '/tmp/nile_config',
  nileInstalled: '/tmp/nile_config/installed.json',
  nileLibrary: '/tmp/nile_config/library.json'
}))
jest.mock('../games', () => ({ default: class {} }))
jest.mock('../../index', () => ({ libraryManagerMap: {} }))

import type { GameInfo } from 'common/types'
import type { NileInstallMetadataInfo } from 'common/types/nile'
import { installStore } from '../electronStores'
import NileLibraryManager from '../library'

type Internals = {
  library: Map<string, GameInfo>
  installedGames: Map<string, NileInstallMetadataInfo>
}

const installed = (): GameInfo =>
  ({
    app_name: 'amzn1',
    runner: 'nile',
    title: 'Game',
    is_installed: true,
    install: { install_path: '/g/game', version: '1.0', platform: 'Windows' }
  }) as GameInfo

describe('NileLibraryManager.installState', () => {
  let manager: NileLibraryManager
  let internals: Internals

  beforeEach(() => {
    manager = new NileLibraryManager()
    internals = manager as unknown as Internals
    internals.library.set('amzn1', installed())
    internals.installedGames.set('amzn1', {
      id: 'amzn1'
    } as NileInstallMetadataInfo)
  })

  test('after an uninstall the game reads as not installed at once, with no refresh', () => {
    manager.installState('amzn1', false)

    const game = manager.getGameInfo('amzn1')
    expect(game?.is_installed).toBe(false)
    expect(game?.install).toEqual({})
  })

  test('forgets the game in the installed lists', () => {
    manager.installState('amzn1', false)

    expect(internals.installedGames.has('amzn1')).toBe(false)
    expect(installStore.delete).toHaveBeenCalledWith('amzn1')
  })

  test('a game that is not in the library does not make it fail', () => {
    expect(() => manager.installState('unknown', false)).not.toThrow()
  })
})
