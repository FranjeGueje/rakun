// What GOG install does with each way gogdl can end. The failure that matters:
// gogdl says «Not enough disk space» and exits with 2, and the game must not
// become an installed one
jest.mock('backend/logger', () => ({
  LogPrefix: { Gog: 'Gog' },
  createGameLogWriter: jest.fn(),
  logDebug: jest.fn(),
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn()
}))
jest.mock('../../../utils', () => ({
  getFileSize: jest.fn(() => '1 GB'),
  getPathDiskSize: jest.fn(() => Promise.resolve(1)),
  sendProgressUpdate: jest.fn(),
  spawnAsync: jest.fn(),
  sendGameStatusUpdate: jest.fn()
}))
jest.mock('../../../config', () => ({
  GlobalConfig: { get: () => ({ getSettings: () => ({ maxWorkers: 0 }) }) }
}))
jest.mock('../../../ipc', () => ({ sendFrontendMessage: jest.fn() }))
jest.mock('../electronStores', () => ({
  installedGamesStore: { get: jest.fn(), set: jest.fn() }
}))
jest.mock('../user', () => ({ GOGUser: { getCredentials: jest.fn() } }))
jest.mock('../download_args', () => ({ downloadArgs: jest.fn(() => ['x']) }))
jest.mock('../constants', () => ({ gogSupportPath: '/tmp/gog-support' }))
jest.mock('../../index', () => ({ libraryManagerMap: {} }))

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { installedGamesStore } from '../electronStores'
import { GOGUser } from '../user'
import { libraryManagerMap } from '../../index'
import GOGGame from '../games'

const runRunnerCommand = jest.fn()
let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rakun-gog-install-'))
  jest.mocked(installedGamesStore.get).mockReturnValue([])
  jest.mocked(GOGUser.getCredentials).mockResolvedValue({} as never)
  runRunnerCommand.mockReset()
  ;(libraryManagerMap as Record<string, unknown>)['gog'] = {
    runRunnerCommand,
    refreshInstalled: jest.fn(),
    getInstallInfo: jest.fn().mockResolvedValue({
      folder_name: 'Game',
      game: { version: '1', buildId: 'b1' },
      manifest: { versionEtag: 'e1' }
    })
  }
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

const install = () => {
  const game = new GOGGame('g1')
  game.getGameInfo = jest.fn().mockReturnValue({ install: {} })
  return game.install({ path: root, platformToInstall: 'windows' } as never)
}

const withFiles = () => {
  mkdirSync(join(root, 'Game'))
  writeFileSync(join(root, 'Game', 'game.exe'), 'x')
}

describe('GOGGame.install and the way gogdl ends', () => {
  test('it ended well and the files are there: installed, with its path', async () => {
    withFiles()
    runRunnerCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })

    expect(await install()).toEqual({
      status: 'done',
      installPath: join(root, 'Game')
    })
    expect(installedGamesStore.set).toHaveBeenCalled()
  })

  test('not enough disk space (exit 2, said on stdout): an error, and nothing is saved', async () => {
    runRunnerCommand.mockResolvedValue({
      stdout: 'Unable to proceed, Not enough disk space',
      stderr: '',
      code: 2
    })

    const result = await install()

    expect(result.status).toBe('error')
    expect(result.error).toContain('Not enough disk space')
    expect(installedGamesStore.set).not.toHaveBeenCalled()
  })

  test('exit 0 but nothing in the folder: an error, nothing is saved', async () => {
    runRunnerCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })

    const result = await install()

    expect(result.status).toBe('error')
    expect(result.error).toContain('Nothing was installed')
    expect(installedGamesStore.set).not.toHaveBeenCalled()
  })

  test('stopped on purpose is an abort, not an error', async () => {
    runRunnerCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      code: 143,
      abort: true
    })

    expect(await install()).toEqual({ status: 'abort' })
    expect(installedGamesStore.set).not.toHaveBeenCalled()
  })
})
