import { addHandler, addListener } from 'backend/ipc'
import { GlobalConfig } from 'backend/config'
import { writeConfig } from 'backend/utils'

addHandler('requestAppSettings', () => GlobalConfig.get().getSettings())

addHandler('writeConfig', (_e, config) => writeConfig(config))

addListener('setSetting', (_e, { key, value }) => {
  GlobalConfig.get().setSetting(key, value)
})
