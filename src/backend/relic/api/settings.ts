import { addHandler, addListener } from 'backend/ipc'
import { GameConfig } from 'backend/game_config'
import { GlobalConfig } from 'backend/config'
import { writeConfig } from 'backend/utils'

addHandler('requestAppSettings', () => GlobalConfig.get().getSettings())
addHandler(
  'requestGameSettings',
  async (_e, appName) => await GameConfig.get(appName).getSettings()
)

addHandler('writeConfig', (event, { appName, config }) =>
  writeConfig(appName, config)
)

addListener('setSetting', (event, { appName, key, value }) => {
  if (appName === 'default') {
    GlobalConfig.get().setSetting(key, value)
  } else {
    GameConfig.get(appName).setSetting(key, value)
  }
})
