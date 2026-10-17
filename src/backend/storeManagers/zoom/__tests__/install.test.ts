import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

jest.mock('backend/logger', () => ({
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Zoom: 'Zoom' }
}))
jest.mock('../stores', () => ({
  installedGamesStore: { get: jest.fn(() => []), set: jest.fn() },
  libraryStore: { get: jest.fn(() => []), set: jest.fn() }
}))
jest.mock('../../../utils', () => ({
  getFileSize: () => '1 MB',
  parseSize: () => 10,
  spawnAsync: jest.fn(),
  sendProgressUpdate: jest.fn(),
  moveOnUnix: jest.fn()
}))
jest.mock('../../../dialog/dialog', () => ({
  showDialogBoxModalAuto: jest.fn()
}))
jest.mock('backend/utils/aborthandler/aborthandler', () => ({
  createAbortController: () => new AbortController()
}))
jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() } }))
jest.mock('../download', () => ({ saveStreamToFile: jest.fn() }))
const mockInteractive = jest.fn()
jest.mock('../windows_install', () => ({
  ...jest.requireActual('../windows_install'),
  installZoomInteractively: (...args: unknown[]) => mockInteractive(...args)
}))
const getInstallers = jest.fn()
jest.mock('../../index', () => ({
  libraryManagerMap: {
    zoom: {
      refresh: jest.fn(),
      updateGameInLibrary: jest.fn(),
      getInstallers: (...args: unknown[]) => getInstallers(...args)
    }
  }
}))

import axios from 'axios'
import { saveStreamToFile } from '../download'
import ZoomGame from '../games'
import { installedGamesStore, libraryStore } from '../stores'

const WINDOWS_INSTALLER = {
  url: 'https://zoom/setup.exe',
  filename: 'Setup-1.0.exe',
  size: '1 MB'
}

describe('ZoomGame.install, Windows', () => {
  let root: string
  let game: ZoomGame

  beforeEach(() => {
    jest.clearAllMocks()
    root = mkdtempSync(join(tmpdir(), 'zoom-install-'))
    game = new ZoomGame('guid')
    jest
      .spyOn(game, 'getGameInfo')
      .mockReturnValue({ app_name: 'guid', folder_name: 'game' } as never)
    getInstallers.mockResolvedValue([WINDOWS_INSTALLER])
    mockInteractive.mockResolvedValue({})
    jest.mocked(saveStreamToFile).mockImplementation((_stream, destination) => {
      writeFileSync(destination, 'installer')
      return Promise.resolve()
    })
    jest.mocked(installedGamesStore.get).mockReturnValue([])
    jest.mocked(libraryStore.get).mockReturnValue([])
    jest.mocked(axios.get).mockResolvedValue({ data: 'stream' })
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const install = (installMode?: 'steam' | 'interactive') =>
    game.install({ path: root, platformToInstall: 'windows', installMode })

  const installerFolder = () => join(root, 'game', 'drive_c', 'zoom_installer')

  test('by default it only leaves the installer and its .inf in the prefix, for the runner', async () => {
    const result = await install()

    expect(result).toEqual({ status: 'done', installPath: join(root, 'game') })
    expect(mockInteractive).not.toHaveBeenCalled()
    expect(existsSync(join(installerFolder(), 'Setup-1.0.exe'))).toBe(true)
    expect(
      readFileSync(join(installerFolder(), 'zoom_installer.inf'), 'utf-8')
    ).toContain('DisableDirPage=yes')
    expect(installedGamesStore.set).toHaveBeenCalledWith('installed', [
      expect.objectContaining({
        platform: 'windows',
        executable: 'Setup-1.0.exe'
      })
    ])
  })

  test('interactive runs the installer now, and a failure is the install failing', async () => {
    expect(await install('interactive')).toMatchObject({ status: 'done' })
    expect(mockInteractive).toHaveBeenCalledWith(
      'guid',
      join(root, 'game'),
      'Setup-1.0.exe'
    )

    mockInteractive.mockResolvedValue({ error: 'cancelled' })
    expect(await install('interactive')).toEqual({
      status: 'error',
      error: 'cancelled'
    })
  })

  test('no installer is an error, and nothing is created', async () => {
    getInstallers.mockResolvedValue([])

    expect(await install()).toEqual({
      status: 'error',
      error: 'No installer found'
    })
    expect(existsSync(join(root, 'game'))).toBe(false)
  })
})
