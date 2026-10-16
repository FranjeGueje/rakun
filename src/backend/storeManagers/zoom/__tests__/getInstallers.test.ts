jest.mock('backend/logger')
jest.mock('backend/utils', () => ({ parseSize: jest.fn() }))
jest.mock('backend/config', () => ({ GlobalConfig: { get: jest.fn() } }))
jest.mock('backend/online_monitor', () => ({ isOnline: jest.fn() }))
jest.mock('backend/ipc', () => ({ sendFrontendMessage: jest.fn() }))
jest.mock('../../index', () => ({ libraryManagerMap: {} }))
jest.mock('../games', () => ({ default: class {} }))
jest.mock('../user', () => ({ ZoomUser: { makeRequest: jest.fn() } }))
jest.mock('../electronStores', () => ({
  installInfoStore: { get: jest.fn(), set: jest.fn() },
  installedGamesStore: { get: jest.fn(), set: jest.fn() },
  libraryStore: { get: jest.fn(), set: jest.fn() }
}))

import { ZoomUser } from '../user'
import ZoomLibraryManager from '../library'

describe('getInstallers', () => {
  test('the file name is only a name, whatever Zoom says it is', async () => {
    jest
      .mocked(ZoomUser.makeRequest)
      .mockResolvedValueOnce({
        windows: [
          { id: 1, name: '../../../.bashrc', size: '1 MB' },
          { id: 2, name: 'setup.exe', size: '1 MB' }
        ]
      })
      .mockResolvedValue({ url: 'https://cdn.example/file' })

    const files = await new ZoomLibraryManager().getInstallers('windows', 'g1')

    expect(files.map((file) => file.filename)).toEqual(['.bashrc', 'setup.exe'])
  })
})
