import { dispatchListener, invokeHandler } from 'backend/ipc'
import { GlobalConfig } from 'backend/config'
import { writeConfig } from 'backend/utils'
import { withoutSecrets } from './../settings'

jest.mock('backend/config', () => ({ GlobalConfig: { get: jest.fn() } }))
jest.mock('backend/utils', () => ({ writeConfig: jest.fn() }))

const globalConfig = { getSettings: jest.fn(), setSetting: jest.fn() }
const settings = { maxWorkers: 0, language: 'en', autoUpdateGames: true }

beforeEach(() => {
  jest.mocked(GlobalConfig.get).mockReturnValue(globalConfig as never)
  globalConfig.getSettings.mockReturnValue(settings)
})

describe('settings handlers', () => {
  test('requestAppSettings answers the global settings', async () => {
    expect(await invokeHandler('requestAppSettings')).toEqual({
      ...settings,
      steamGridDbApiKey: ''
    })
  })

  test('requestAppSettings never gives the SteamGridDB key back', async () => {
    globalConfig.getSettings.mockReturnValue({
      ...settings,
      steamGridDbApiKey: 'secret'
    })
    expect(await invokeHandler('requestAppSettings')).toEqual({
      ...settings,
      steamGridDbApiKey: ''
    })
  })

  test('withoutSecrets empties only the key', () => {
    const all = { ...settings, steamGridDbApiKey: 'k' } as never
    expect(withoutSecrets(all)).toEqual({ ...settings, steamGridDbApiKey: '' })
  })

  test('setSetting changes one global setting', () => {
    dispatchListener('setSetting', { key: 'maxWorkers', value: 2 })

    expect(globalConfig.setSetting).toHaveBeenCalledWith('maxWorkers', 2)
  })

  test('writeConfig takes the settings alone, with no game name', async () => {
    await invokeHandler('writeConfig', { autoUpdateGames: false })

    expect(writeConfig).toHaveBeenCalledWith({ autoUpdateGames: false })
  })

  test('setSetting refuses an invalid value before saving', () => {
    expect(() =>
      dispatchListener('setSetting', { key: 'language', value: 'xx' })
    ).toThrow('Unsupported language')
    expect(globalConfig.setSetting).not.toHaveBeenCalledWith('language', 'xx')
  })

  test('writeConfig refuses an invalid value before saving', async () => {
    await expect(
      invokeHandler('writeConfig', { maxWorkers: -1 })
    ).rejects.toThrow('must be an integer')
    expect(writeConfig).not.toHaveBeenCalledWith({ maxWorkers: -1 })
  })

  test('getMaxCpus answers a number', async () => {
    expect(await invokeHandler('getMaxCpus')).toBeGreaterThan(0)
  })
})
