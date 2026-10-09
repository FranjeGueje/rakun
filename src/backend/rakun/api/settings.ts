import { cpus } from 'os'
import { addHandler, addListener, sendFrontendMessage } from 'backend/ipc'
import { GlobalConfig } from 'backend/config'
import { clearCache, handleExit, writeConfig } from 'backend/utils'
import { resetAndStop, stopAfterReply } from '../reset'
import { validateSetting, validateSettings } from '../settings_validation'

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

addListener('resetRakun', () => resetAndStop(handleExit))

addListener('stopRakun', () => stopAfterReply(handleExit))
