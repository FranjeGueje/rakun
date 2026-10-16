import { onGameInstalled } from 'backend/rakun/game_events'
import { libraryManagerMap } from 'backend/storeManagers'
import { logError } from 'backend/logger'
import { isOnline } from 'backend/online_monitor'
import type { InstallParams } from 'common/types'
import { installQueueElement } from '../utils'

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend', DownloadManager: 'DownloadManager' }
}))
jest.mock('backend/utils', () => ({ sendGameStatusUpdate: jest.fn() }))
jest.mock('backend/online_monitor', () => ({ isOnline: jest.fn() }))
jest.mock('backend/rakun/game_events', () => ({ onGameInstalled: jest.fn() }))
jest.mock('backend/dialog/dialog', () => ({
  showDialogBoxModalAuto: jest.fn()
}))
jest.mock('backend/storeManagers', () => ({ libraryManagerMap: {} }))

const install = jest.fn()
const params = {
  appName: 'g1',
  runner: 'gog',
  path: '/games',
  platformToInstall: 'windows'
} as unknown as InstallParams

// The config resets the mocks before each test: what they answer is set here
beforeEach(() => {
  jest.mocked(isOnline).mockReturnValue(true)
  install.mockReset()
  jest.mocked(onGameInstalled).mockReset()
  jest.mocked(onGameInstalled).mockResolvedValue({ success: true })
  ;(libraryManagerMap as Record<string, unknown>)['gog'] = {
    getGame: () => ({ install, getGameInfo: () => ({ title: 'Game' }) })
  }
})

describe('installQueueElement and Steam', () => {
  test('a finished install goes to Steam with the path the store gave', async () => {
    install.mockResolvedValue({ status: 'done', installPath: '/games/Game' })

    await installQueueElement(params)

    expect(onGameInstalled).toHaveBeenCalledWith(
      expect.objectContaining({ install }),
      '/games/Game'
    )
  })

  test.each(['error', 'abort'])(
    'an install that ended in %s does not',
    async (status) => {
      install.mockResolvedValue({ status })

      await installQueueElement(params)

      expect(onGameInstalled).not.toHaveBeenCalled()
    }
  )

  test('a failure in Steam is logged and does not undo an install that worked', async () => {
    install.mockResolvedValue({ status: 'done' })
    jest.mocked(onGameInstalled).mockRejectedValue(new Error('no Steam'))

    expect(await installQueueElement(params)).toEqual({
      status: 'done',
      error: undefined,
      installPath: undefined
    })
    await new Promise((resolve) => setImmediate(resolve))

    expect(logError).toHaveBeenCalledWith(expect.any(Error), 'DownloadManager')
  })
})
