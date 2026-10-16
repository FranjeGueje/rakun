jest.mock('backend/logger', () => ({
  LogPrefix: { Nile: 'Nile' },
  logDebug: jest.fn(),
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn()
}))
jest.mock('../electronStores', () => ({
  installStore: { get: jest.fn(), set: jest.fn() },
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
  NileUser: { isLoggedIn: jest.fn(() => true), getUserData: jest.fn() }
}))
jest.mock('../constants', () => ({
  nileConfigPath: '/tmp/nile_config',
  nileInstalled: '/tmp/nile_config/installed.json',
  nileLibrary: '/tmp/nile_config/library.json'
}))
jest.mock('../games', () => ({ default: class {} }))
jest.mock('../../index', () => ({ libraryManagerMap: {} }))
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => true),
  readFileSync: jest.fn(() => '[]'),
  writeFileSync: jest.fn(),
  cpSync: jest.fn()
}))

import NileLibraryManager from '../library'
import { callRunner } from 'backend/runner_call'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { getNileBin } from 'backend/utils'
import { clearSessionExpired, isSessionExpired } from '../../session_state'
import { NileUser } from '../user'

// The backend jest config sets resetMocks, so implementations have to be
// (re)installed inside beforeEach rather than at jest.mock() time
const mockedIsLoggedIn = jest.mocked(NileUser.isLoggedIn)

describe('NileLibraryManager.init', () => {
  let manager: NileLibraryManager

  beforeEach(() => {
    manager = new NileLibraryManager()
    // isLoggedIn returns the user data, not a boolean; only truthiness matters here
    mockedIsLoggedIn.mockReturnValue({} as never)
  })

  test('does not sync with Amazon, only loads what is on disk', async () => {
    // The backend used to call refresh() here while the frontend also fired
    // "Refreshing all Library", so every startup ran `nile library sync` twice
    const refresh = jest.spyOn(manager, 'refresh')
    const refreshInstalled = jest.spyOn(manager, 'refreshInstalled')
    const loadGamesInAccount = jest.spyOn(manager, 'loadGamesInAccount')

    await manager.init()

    expect(refresh).not.toHaveBeenCalled()
    expect(refreshInstalled).toHaveBeenCalled()
    expect(loadGamesInAccount).toHaveBeenCalled()
  })
})

describe('NileLibraryManager.refresh', () => {
  let manager: NileLibraryManager

  beforeEach(() => {
    manager = new NileLibraryManager()
    // isLoggedIn returns the user data, not a boolean; only truthiness matters here
    mockedIsLoggedIn.mockReturnValue({} as never)
  })

  test('waits for the Amazon sync before rebuilding from disk', async () => {
    // refreshInstalled/loadGamesInAccount read the files the sync writes, so
    // reading them first would rebuild from the previous sync's data
    const order: string[] = []

    manager.runRunnerCommand = jest.fn().mockImplementation(async () => {
      order.push('sync-start')
      await new Promise((resolve) => setTimeout(resolve, 10))
      order.push('sync-done')
      return { stdout: '', stderr: '' }
    })
    jest
      .spyOn(manager, 'refreshInstalled')
      .mockImplementation(() => order.push('read-installed') as never)
    jest
      .spyOn(manager, 'loadGamesInAccount')
      .mockImplementation(() => order.push('read-library') as never)

    await manager.refresh()

    expect(order).toEqual([
      'sync-start',
      'sync-done',
      'read-installed',
      'read-library'
    ])
  })
})

describe('NileLibraryManager and a token Amazon will not renew', () => {
  let manager: NileLibraryManager

  beforeEach(() => {
    clearSessionExpired('nile')
    jest.mocked(getNileBin).mockReturnValue({ dir: '/tmp', bin: 'nile' })
    manager = new NileLibraryManager()
    mockedIsLoggedIn.mockReturnValue({} as never)
    jest.spyOn(manager, 'refreshInstalled').mockImplementation(() => undefined)
    jest
      .spyOn(manager, 'loadGamesInAccount')
      .mockImplementation(() => undefined)
  })

  test('a command whose output says nile could not renew the token marks the session', async () => {
    jest.mocked(callRunner).mockResolvedValue({
      stdout: '',
      stderr: 'ERROR [AUTH]:\t Failed to refresh the token {"error":"x"}'
    })

    await manager.runRunnerCommand(['library', 'sync'])

    expect(isSessionExpired('nile')).toBe(true)
  })

  test('the same words over a dead connection do not', async () => {
    jest.mocked(callRunner).mockResolvedValue({
      stdout: '',
      stderr:
        'Failed to refresh the token\nrequests.exceptions.ConnectionError: Max retries exceeded'
    })

    await manager.runRunnerCommand(['library', 'sync'])

    expect(isSessionExpired('nile')).toBe(false)
  })

  test('a library sync that goes through clears the mark', async () => {
    jest.mocked(callRunner).mockResolvedValueOnce({
      stdout: '',
      stderr: 'Failed to refresh the token'
    })
    await manager.refresh()
    expect(isSessionExpired('nile')).toBe(true)

    jest.mocked(callRunner).mockResolvedValue({ stdout: '', stderr: '' })
    await manager.refresh()

    expect(isSessionExpired('nile')).toBe(false)
  })
})

describe('NileLibraryManager.updateInstalledPathInJSON and a file it cannot read', () => {
  // The config resets the mocks before each test: the file is there
  beforeEach(() => {
    jest.mocked(existsSync).mockReturnValue(true)
  })

  const update = (manager: NileLibraryManager) =>
    (
      manager as unknown as {
        updateInstalledPathInJSON: (appName: string, path: string) => void
      }
    ).updateInstalledPathInJSON('g1', '/new/path')

  test('installed.json is rewritten with the new path when it can be read', () => {
    jest
      .mocked(readFileSync)
      .mockReturnValue(JSON.stringify([{ id: 'g1', path: '/old' }]))
    const manager = new NileLibraryManager()

    update(manager)

    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('installed.json'),
      JSON.stringify([{ id: 'g1', path: '/new/path' }]),
      'utf-8'
    )
  })

  test('a file nile wrote in another shape is not written back empty', () => {
    jest.mocked(readFileSync).mockReturnValue('{"not":"an array"}')
    const manager = new NileLibraryManager()

    update(manager)

    expect(writeFileSync).not.toHaveBeenCalled()
  })

  test('nor is a file that is cut short', () => {
    jest.mocked(readFileSync).mockReturnValue('[{"id":"g1","pa')
    const manager = new NileLibraryManager()

    update(manager)

    expect(writeFileSync).not.toHaveBeenCalled()
  })

  test('a game that is not in it does not rewrite the file either', () => {
    jest
      .mocked(readFileSync)
      .mockReturnValue(JSON.stringify([{ id: 'other', path: '/x' }]))
    const manager = new NileLibraryManager()

    update(manager)

    expect(writeFileSync).not.toHaveBeenCalled()
  })
})
