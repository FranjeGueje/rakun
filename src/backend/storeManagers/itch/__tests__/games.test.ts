const mockStored: { installed: unknown[] } = { installed: [] }
const mockButlerd = { call: jest.fn(), on: jest.fn() }
const mockInfo = jest.fn()

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Itch: 'Itch' }
}))
jest.mock('backend/rakun/game_events', () => ({
  onGameInstalled: jest.fn(),
  onGameRepaired: jest.fn(),
  onGameUninstalled: jest.fn()
}))
jest.mock('../../../ipc', () => ({ sendFrontendMessage: jest.fn() }))
jest.mock('../../../utils', () => ({ sendProgressUpdate: jest.fn() }))
jest.mock('../../index', () => ({
  libraryManagerMap: {
    itch: {
      getGameInfo: (...args: unknown[]) => mockInfo(...args),
      findUpload: jest.fn(),
      refreshInstalled: jest.fn()
    }
  }
}))
jest.mock('../client', () => ({
  getButlerd: () => Promise.resolve(mockButlerd)
}))
jest.mock('../electronStores', () => ({
  installedGamesStore: {
    get: (_key: string, fallback: unknown[]) =>
      mockStored.installed ?? fallback,
    set: (_key: string, value: unknown[]) => {
      mockStored.installed = value
    }
  }
}))
jest.mock('../install_location', () => ({ installLocationFor: jest.fn() }))
jest.mock('../operation', () => ({
  ...jest.requireActual('../operation'),
  discardPartialInstall: jest.fn()
}))
jest.mock('../executable', () => ({
  findExecutable: jest.fn(),
  writeStartScript: jest.fn()
}))

import { logError } from 'backend/logger'
import {
  onGameInstalled,
  onGameRepaired,
  onGameUninstalled
} from 'backend/rakun/game_events'
import { libraryManagerMap } from '../../index'
import { findExecutable, writeStartScript } from '../executable'
import { installLocationFor } from '../install_location'
import { callAbortController } from '../../../utils/aborthandler/aborthandler'
import { ButlerdError } from '../butlerd'
import { discardPartialInstall } from '../operation'
import ItchGameManager from '../games'

const QUEUED = {
  id: 'q1',
  caveId: 'cave-1',
  installFolder: '/games/pacapong',
  stagingFolder: '/staging'
}

const findUpload = jest.mocked(
  (libraryManagerMap['itch'] as unknown as { findUpload: jest.Mock }).findUpload
)
const mockedFindExecutable = jest.mocked(findExecutable)
const mockedOnGameInstalled = jest.mocked(onGameInstalled)
const mockedOnGameRepaired = jest.mocked(onGameRepaired)
const mockedOnGameUninstalled = jest.mocked(onGameUninstalled)

/** What butlerd answers to each call the game manager makes */
function butlerdAnswers(overrides: Record<string, unknown> = {}) {
  mockButlerd.call.mockImplementation((method: string) => {
    const answer = {
      'Fetch.Game': { game: { id: 21301 } },
      'Install.Queue': QUEUED,
      'Install.Perform': {},
      'Uninstall.Perform': {},
      ...overrides
    }[method]
    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(answer)
  })
}

const installedGame = (extra: Record<string, unknown> = {}) => ({
  app_name: '21301',
  is_installed: true,
  install: {
    caveId: 'cave-1',
    platform: 'windows',
    executable: 'pacapong.exe',
    install_path: '/games/pacapong',
    ...extra
  }
})

const game = () => new ItchGameManager('21301')

beforeEach(() => {
  jest.clearAllMocks()
  mockStored.installed = []
  mockInfo.mockReturnValue({ app_name: '21301', install: {} })
  findUpload.mockResolvedValue({ id: 7 })
  mockedFindExecutable.mockResolvedValue('pacapong.exe')
  mockedOnGameInstalled.mockResolvedValue({ success: true })
  mockedOnGameRepaired.mockResolvedValue(undefined)
  mockedOnGameUninstalled.mockResolvedValue(undefined)
  mockButlerd.on.mockImplementation(() => jest.fn())
  jest.mocked(installLocationFor).mockResolvedValue('location-id')
  butlerdAnswers()
})

describe('install', () => {
  const args = { path: '/games', platformToInstall: 'windows' as const }

  test('is done as soon as the game is on the disk and saved, with its executable', async () => {
    expect(await game().install(args)).toEqual({ status: 'done' })

    expect(mockStored.installed).toEqual([
      expect.objectContaining({
        appName: '21301',
        platform: 'windows',
        install_path: '/games/pacapong',
        executable: 'pacapong.exe',
        caveId: 'cave-1'
      })
    ])
    expect(mockedOnGameInstalled).toHaveBeenCalledWith(
      expect.anything(),
      '/games/pacapong'
    )
  })

  test('a failure in Steam is logged and does not undo an install that worked', async () => {
    mockedOnGameInstalled.mockRejectedValue(new Error('no Steam'))

    expect(await game().install(args)).toEqual({ status: 'done' })
    await new Promise((resolve) => setImmediate(resolve))

    expect(logError).toHaveBeenCalledWith(
      [
        expect.stringContaining('Steam integration of 21301'),
        expect.any(Error)
      ],
      'Itch'
    )
    expect(mockStored.installed).toHaveLength(1)
  })

  test('says which build is missing when the game has none for the platform', async () => {
    findUpload.mockResolvedValue(undefined)

    expect(await game().install(args)).toEqual({
      status: 'error',
      error: 'No windows build'
    })
    expect(mockButlerd.call).not.toHaveBeenCalledWith(
      'Install.Queue',
      expect.anything()
    )
  })

  test('a failing butler is an error, and nothing is saved', async () => {
    butlerdAnswers({ 'Install.Perform': new Error('disk full') })

    const result = await game().install(args)

    expect(result.status).toBe('error')
    expect(mockStored.installed).toEqual([])
    expect(mockedOnGameInstalled).not.toHaveBeenCalled()
  })

  test('a Linux build gets a start.sh, a Windows one does not', async () => {
    await game().install({ ...args, platformToInstall: 'linux' })
    expect(writeStartScript).toHaveBeenCalledWith(
      '/games/pacapong',
      'pacapong.exe'
    )
    expect(mockStored.installed).toEqual([
      expect.objectContaining({ platform: 'linux' })
    ])

    jest.mocked(writeStartScript).mockClear()
    await game().install(args)
    expect(writeStartScript).not.toHaveBeenCalled()
  })

  test('when butler finds nothing to run, the game is installed but it is an error, and Steam is left alone', async () => {
    mockedFindExecutable.mockResolvedValue(undefined)

    const result = await game().install(args)

    expect(result.status).toBe('error')
    expect(result.error).toContain('no executable to run in /games/pacapong')
    // It stays installed, so that it can be repaired or uninstalled
    expect(mockStored.installed).toEqual([
      expect.objectContaining({ executable: '' })
    ])
    expect(writeStartScript).not.toHaveBeenCalled()
    expect(mockedOnGameInstalled).not.toHaveBeenCalled()
  })

  describe('paused or cancelled', () => {
    /** Butler is performing until the cancel reaches it, as the real one does */
    const performingUntilCancelled = () =>
      mockButlerd.call.mockImplementation((method: string) => {
        if (method === 'Install.Queue') return Promise.resolve(QUEUED)
        if (method === 'Install.Cancel')
          return Promise.resolve({ didCancel: true })
        if (method === 'Install.Perform')
          return new Promise((_resolve, reject) => {
            mockButlerd.call.mockImplementationOnce((m: string) => {
              if (m === 'Install.Cancel')
                reject(new Error('The operation was cancelled.'))
              return Promise.resolve({ didCancel: true })
            })
          })
        return Promise.resolve({ game: { id: 21301 } })
      })

    test('the abort of the download manager cancels it in butler and ends as abort, saving nothing', async () => {
      performingUntilCancelled()

      const installing = game().install(args)
      await new Promise((resolve) => setTimeout(resolve, 20))
      callAbortController('21301')

      expect(await installing).toEqual({ status: 'abort' })
      expect(mockButlerd.call).toHaveBeenCalledWith('Install.Cancel', {
        id: 'q1'
      })
      expect(mockStored.installed).toEqual([])
      expect(mockedOnGameInstalled).not.toHaveBeenCalled()
    })

    test('what butler left of the new install is discarded, inside the place it was installing in', async () => {
      performingUntilCancelled()

      const installing = game().install(args)
      await new Promise((resolve) => setTimeout(resolve, 20))
      callAbortController('21301')
      await installing

      expect(discardPartialInstall).toHaveBeenCalledWith(QUEUED, '/games')
    })
  })
})

describe('repair and update', () => {
  beforeEach(() => {
    mockInfo.mockReturnValue(installedGame())
  })

  test('repair asks butler to heal the install and leaves the Steam hook to the handler', async () => {
    const result = await game().repair()

    expect(mockButlerd.call).toHaveBeenCalledWith('Install.Queue', {
      caveId: 'cave-1',
      reason: 'heal'
    })
    expect(result).toMatchObject({ stdout: 'done', stderr: '' })
    expect(result.error).toBeUndefined()
    expect(mockedOnGameRepaired).not.toHaveBeenCalled()
  })

  test('a failed repair says so in `error`, which is what the handler looks at', async () => {
    butlerdAnswers({ 'Install.Perform': new Error('corrupt') })

    const result = await game().repair()

    expect(result.error).toContain('corrupt')
  })

  test('repair of a game that is not installed is an error', async () => {
    mockInfo.mockReturnValue({ app_name: '21301', install: {} })

    expect((await game().repair()).error).toBe("Game isn't installed")
  })

  test('an update that leaves the executable where it was does not touch Steam', async () => {
    expect(await game().update()).toEqual({ status: 'done' })

    expect(mockButlerd.call).toHaveBeenCalledWith('Install.Queue', {
      caveId: 'cave-1',
      reason: 'update'
    })
    expect(mockedOnGameRepaired).not.toHaveBeenCalled()
  })

  test('an update that moves the executable has the .bat written again', async () => {
    mockedFindExecutable.mockResolvedValue('v2/pacapong.exe')

    await game().update()

    expect(mockedOnGameRepaired).toHaveBeenCalledTimes(1)
    expect(mockStored.installed).toEqual([
      expect.objectContaining({ executable: 'v2/pacapong.exe' })
    ])
  })
})

describe('uninstall', () => {
  test('removes the install from butler, forgets it and then tells Steam', async () => {
    mockStored.installed = [
      { appName: '21301', caveId: 'cave-1', install_path: '/games/pacapong' }
    ]
    const order: string[] = []
    mockButlerd.call.mockImplementation((method: string) => {
      order.push(method)
      return Promise.resolve({})
    })
    mockedOnGameUninstalled.mockImplementation(() => {
      order.push(`hook after ${mockStored.installed.length} installed`)
      return Promise.resolve()
    })

    const result = await game().uninstall()

    expect(order).toEqual(['Uninstall.Perform', 'hook after 0 installed'])
    expect(mockButlerd.call).toHaveBeenCalledWith('Uninstall.Perform', {
      caveId: 'cave-1',
      hard: true
    })
    expect(result.stdout).toBe('Uninstalled')
  })

  test('an install that butler no longer has is forgotten all the same', async () => {
    mockStored.installed = [
      { appName: '21301', caveId: 'cave-1', install_path: '/games/pacapong' }
    ]
    mockButlerd.call.mockRejectedValue(
      new ButlerdError(-32603, 'cave not found: (cave-1)')
    )

    const result = await game().uninstall()

    expect(result.stdout).toBe('Uninstalled')
    expect(mockStored.installed).toEqual([])
    expect(mockedOnGameUninstalled).toHaveBeenCalled()
  })

  test('any other failure of butler leaves the game installed', async () => {
    mockStored.installed = [
      { appName: '21301', caveId: 'cave-1', install_path: '/games/pacapong' }
    ]
    mockButlerd.call.mockRejectedValue(new ButlerdError(1, 'disk on fire'))

    await expect(game().uninstall()).rejects.toThrow('disk on fire')
    expect(mockStored.installed).toHaveLength(1)
    expect(mockedOnGameUninstalled).not.toHaveBeenCalled()
  })

  test('fails when the game is not installed', async () => {
    await expect(game().uninstall()).rejects.toThrow("Game isn't installed")
    expect(mockedOnGameUninstalled).not.toHaveBeenCalled()
  })
})

describe('what itch.io does not support', () => {
  test('moving an install is refused, and so is importing a folder', async () => {
    expect(await game().moveInstall()).toEqual({
      status: 'error',
      error: 'Not supported for itch.io games'
    })
    expect(await game().importGame()).toEqual({
      stdout: '',
      stderr: 'Not supported for itch.io games'
    })
  })
})
