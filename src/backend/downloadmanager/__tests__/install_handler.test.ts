import { invokeHandler } from 'backend/ipc'
import { addToQueue } from '../downloadqueue'
import type { InstallParams } from 'common/types'

const readLibrary = jest.fn()
jest.mock('backend/storeManagers', () => ({
  stores: { gog: { readLibrary: () => readLibrary() } }
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
    readLibrary.mockReturnValue([{ app_name: 'g1', is_installed: false }])

    await invokeHandler('install', params)

    expect(addToQueue).toHaveBeenCalledTimes(1)
  })

  test('refuses a game that is already installed, queuing nothing', async () => {
    readLibrary.mockReturnValue([{ app_name: 'g1', is_installed: true }])

    await expect(invokeHandler('install', params)).rejects.toThrow(
      'already installed'
    )
    expect(addToQueue).not.toHaveBeenCalled()
  })

  test('refuses an install mode that does not exist, queuing nothing', async () => {
    readLibrary.mockReturnValue([{ app_name: 'g1', is_installed: false }])

    await expect(
      invokeHandler('install', { ...params, installMode: 'silent' })
    ).rejects.toThrow('unknown install mode "silent": use steam or interactive')
    expect(addToQueue).not.toHaveBeenCalled()
  })

  test('passes the two modes there are', async () => {
    readLibrary.mockReturnValue([{ app_name: 'g1', is_installed: false }])

    await invokeHandler('install', { ...params, installMode: 'steam' })
    await invokeHandler('install', { ...params, installMode: 'interactive' })

    expect(addToQueue).toHaveBeenCalledTimes(2)
  })

  test('only the game asked for counts, not the others installed', async () => {
    readLibrary.mockReturnValue([{ app_name: 'other', is_installed: true }])

    await invokeHandler('install', params)

    expect(addToQueue).toHaveBeenCalledTimes(1)
  })
})
