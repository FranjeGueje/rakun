import { invokeHandler } from 'backend/ipc'
import { addToQueue } from '../downloadqueue'
import type { InstallParams } from 'common/types'

const getGameInfo = jest.fn()
jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    gog: { getGameInfo: (...args: unknown[]) => getGameInfo(...args) }
  }
}))
jest.mock('../downloadqueue', () => ({
  addToQueue: jest.fn(),
  cancelCurrentDownload: jest.fn(),
  clearFinished: jest.fn(),
  getQueueInformation: jest.fn(),
  pauseCurrentDownload: jest.fn(),
  removeFromQueue: jest.fn(),
  resumeCurrentDownload: jest.fn()
}))
import '../ipc_handler'

const params = { appName: 'g1', runner: 'gog', path: '/games' } as InstallParams

describe('install', () => {
  test('queues a game that is not installed', async () => {
    getGameInfo.mockReturnValue({ is_installed: false })

    await invokeHandler('install', params)

    expect(addToQueue).toHaveBeenCalledTimes(1)
  })

  test('refuses a game that is already installed, queuing nothing', async () => {
    getGameInfo.mockReturnValue({ is_installed: true })

    await expect(invokeHandler('install', params)).rejects.toThrow(
      'already installed'
    )
    expect(addToQueue).not.toHaveBeenCalled()
  })

  test('a game the store does not know yet is not refused', async () => {
    getGameInfo.mockReturnValue(undefined)

    await invokeHandler('install', params)

    expect(addToQueue).toHaveBeenCalledTimes(1)
  })
})
