import { addHandler, addListener, sendFrontendMessage } from 'backend/ipc'
import { GlobalConfig } from 'backend/config'
import { clearCache, handleExit, writeConfig } from 'backend/utils'
import { resetAndStop } from '../reset'

addHandler('requestAppSettings', () => GlobalConfig.get().getSettings())

addHandler('writeConfig', (_e, config) => writeConfig(config))

addListener('setSetting', (_e, { key, value }) => {
  GlobalConfig.get().setSetting(key, value)
})

addListener('clearCache', (_e, library) => {
  clearCache(library)
  sendFrontendMessage('refreshLibrary')
})

addListener('resetRelic', () => resetAndStop(handleExit))
