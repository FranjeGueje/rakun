import { cpus } from 'os'
import i18next from 'i18next'
import { addHandler, addListener, sendFrontendMessage } from 'backend/ipc'
import { backendEvents } from 'backend/backend_events'
import { GlobalConfig } from 'backend/config'
import { gameInfoStore } from 'backend/storeManagers/legendary/electronStores'
import { clearCache, handleExit, writeConfig } from 'backend/utils'
import { resetAndStop } from '../reset'
import { validateSetting, validateSettings } from '../settings_validation'

// Has to run on every way of changing it: the stores read `i18next.languages`
backendEvents.on('settingChanged', ({ key, newValue }) => {
  if (key !== 'language') return
  void i18next.changeLanguage(newValue as string)
  gameInfoStore.clear()
})

addHandler('requestAppSettings', () => GlobalConfig.get().getSettings())

addHandler('getMaxCpus', () => cpus().length)

addHandler('writeConfig', (_e, config) => {
  validateSettings(config, GlobalConfig.get().getSettings())
  return writeConfig(config)
})

addListener('setSetting', (_e, { key, value }) => {
  validateSetting(key, value, GlobalConfig.get().getSettings())
  GlobalConfig.get().setSetting(key, value)
})

addListener('clearCache', (_e, library) => {
  clearCache(library)
  sendFrontendMessage('refreshLibrary')
})

addListener('resetRelic', () => resetAndStop(handleExit))
