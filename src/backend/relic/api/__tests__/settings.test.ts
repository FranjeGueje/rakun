import { dispatchListener, invokeHandler } from 'backend/ipc'
import { GlobalConfig } from 'backend/config'
import { writeConfig } from 'backend/utils'
import './../settings'

jest.mock('backend/config', () => ({ GlobalConfig: { get: jest.fn() } }))
jest.mock('backend/utils', () => ({ writeConfig: jest.fn() }))

const globalConfig = { getSettings: jest.fn(), setSetting: jest.fn() }

beforeEach(() => {
  jest.mocked(GlobalConfig.get).mockReturnValue(globalConfig as never)
})

describe('settings handlers', () => {
  test('requestAppSettings answers the global settings', async () => {
    globalConfig.getSettings.mockReturnValue({ maxWorkers: 3 })

    expect(await invokeHandler('requestAppSettings')).toEqual({ maxWorkers: 3 })
  })

  test('setSetting changes one global setting', () => {
    dispatchListener('setSetting', { key: 'maxWorkers', value: 2 })

    expect(globalConfig.setSetting).toHaveBeenCalledWith('maxWorkers', 2)
  })

  test('writeConfig takes the settings alone, with no game name', async () => {
    await invokeHandler('writeConfig', { autoUpdateGames: false })

    expect(writeConfig).toHaveBeenCalledWith({ autoUpdateGames: false })
  })
})
