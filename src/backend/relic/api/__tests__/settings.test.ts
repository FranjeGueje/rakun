import { dispatchListener, invokeHandler } from 'backend/ipc'
import { GlobalConfig } from 'backend/config'
import { writeConfig } from 'backend/utils'
import i18next from 'i18next'
import { backendEvents } from 'backend/backend_events'
import { gameInfoStore } from 'backend/storeManagers/legendary/electronStores'
import './../settings'

jest.mock('backend/config', () => ({ GlobalConfig: { get: jest.fn() } }))
jest.mock('backend/utils', () => ({ writeConfig: jest.fn() }))
jest.mock('i18next', () => ({
  __esModule: true,
  default: { changeLanguage: jest.fn() }
}))
jest.mock('backend/storeManagers/legendary/electronStores', () => ({
  gameInfoStore: { clear: jest.fn() }
}))

const globalConfig = { getSettings: jest.fn(), setSetting: jest.fn() }
const settings = { maxWorkers: 0, language: 'en', autoUpdateGames: true }

beforeEach(() => {
  jest.mocked(GlobalConfig.get).mockReturnValue(globalConfig as never)
  globalConfig.getSettings.mockReturnValue(settings)
})

describe('settings handlers', () => {
  test('requestAppSettings answers the global settings', async () => {
    expect(await invokeHandler('requestAppSettings')).toEqual(settings)
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
    ).toThrow('no soportado')
    expect(globalConfig.setSetting).not.toHaveBeenCalledWith('language', 'xx')
  })

  test('writeConfig refuses an invalid value before saving', async () => {
    await expect(
      invokeHandler('writeConfig', { maxWorkers: -1 })
    ).rejects.toThrow('entero')
    expect(writeConfig).not.toHaveBeenCalledWith({ maxWorkers: -1 })
  })

  test('getMaxCpus answers a number', async () => {
    expect(await invokeHandler('getMaxCpus')).toBeGreaterThan(0)
  })

  test('changing the language changes it for i18next and drops the cache', () => {
    backendEvents.emit('settingChanged', {
      key: 'language',
      oldValue: 'en',
      newValue: 'es'
    })
    expect(i18next.changeLanguage).toHaveBeenCalledWith('es')
    expect(gameInfoStore.clear).toHaveBeenCalled()
  })
})
