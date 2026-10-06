import type { DiskSpaceData } from 'common/types'
import * as path from 'path'
import { cpus } from 'os'
import { existsSync } from 'fs'
import i18next from 'i18next'
import { addHandler, addListener, sendFrontendMessage } from 'backend/ipc'
import {
  clearCache,
  isEpicServiceOffline,
  openUrlOrFile,
  resetRelic,
  getFileSize,
  getShellPath,
  removeFolder,
  clearAchievementCache
} from 'backend/utils'
import { getDiskInfo, isWritable } from 'backend/utils/filesystem'
import { Path } from 'backend/schemas'
import { logInfo, LogPrefix } from 'backend/logger'
import { showDialogBoxModalAuto } from 'backend/dialog/dialog'
import { epicLoginUrl } from 'backend/constants/urls'
import { relicVersion } from 'backend/constants/others'
import { configPath, gamesConfigPath } from 'backend/constants/paths'

addHandler('checkDiskSpace', async (_e, folder): Promise<DiskSpaceData> => {
  // FIXME: Propagate errors

  const parsedPath = Path.parse(folder)

  const { freeSpace, totalSpace } = await getDiskInfo(parsedPath)
  const pathIsWritable = await isWritable(parsedPath)

  return {
    free: freeSpace,
    diskSize: totalSpace,
    validPath: pathIsWritable,
    message: `${getFileSize(freeSpace)} / ${getFileSize(totalSpace)}`
  }
})

addListener('openExternalUrl', async (event, url) => openUrlOrFile(url))
addListener('openFolder', async (event, folder) => openUrlOrFile(folder))
addListener('openLoginPage', async () => openUrlOrFile(epicLoginUrl))
addListener('openWebviewPage', async (event, url) => openUrlOrFile(url))
addListener('showConfigFileInFolder', async (event, appName) => {
  if (appName === 'default') {
    return openUrlOrFile(configPath)
  }
  return openUrlOrFile(path.join(gamesConfigPath, `${appName}.json`))
})

addListener('removeFolder', (e, [path, folderName]) => {
  removeFolder(path, folderName)
})

addHandler('getEpicGamesStatus', async () => isEpicServiceOffline())

addHandler('getMaxCpus', () => cpus().length)

addHandler('getRelicVersion', () => relicVersion)

addHandler('showUpdateSetting', () => true)

addListener('clearCache', (_e, showDialog, fromVersionChange = false) => {
  clearCache(undefined, fromVersionChange)
  sendFrontendMessage('refreshLibrary')

  if (showDialog) {
    showDialogBoxModalAuto({
      title: i18next.t('box.cache-cleared.title', 'Cache Cleared'),
      message: i18next.t(
        'box.cache-cleared.message',
        'Relic Cache Was Cleared!'
      ),
      type: 'MESSAGE',
      buttons: [{ text: i18next.t('box.ok', 'Ok') }]
    })
  }
})

addListener('clearAchievementCache', (event, appName: string) => {
  clearAchievementCache(appName)
  logInfo(
    'Achievement cache was cleared for game: ' + appName,
    LogPrefix.Backend
  )
})

addListener('resetRelic', () => resetRelic())

addHandler('getShellPath', async (event, path) => getShellPath(path))

addHandler('pathExists', (e, path: string) => {
  return existsSync(path)
})
