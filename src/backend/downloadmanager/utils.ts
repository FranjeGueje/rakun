import { libraryManagerMap } from 'backend/storeManagers'
import { logError, LogPrefix, logWarning } from 'backend/logger'
import { sendGameStatusUpdate } from '../utils'
import { isRefused } from 'backend/storeManagers/preflight'
import { DMStatus, InstallParams } from 'common/types'
import { isOnline } from '../online_monitor'

async function installQueueElement(params: InstallParams): Promise<{
  status: DMStatus
  error?: string | undefined
}> {
  const {
    appName,
    path,
    installDlcs,
    sdlList = [],
    runner,
    installLanguage,
    platformToInstall,
    build,
    branch
  } = params
  const { title } = libraryManagerMap[runner].getGame(appName).getGameInfo()

  if (!isOnline()) {
    logWarning(
      `App offline, skipping install for game '${title}'.`,
      LogPrefix.Backend
    )
    return { status: 'error' }
  }

  if (await isRefused(runner, 'install', appName)) return { status: 'error' }

  sendGameStatusUpdate({
    appName,
    runner,
    status: 'installing',
    folder: path
  })

  const errorMessage = (error: string) => {
    logError(
      ['Installation of', params.appName, 'failed with:', error],
      LogPrefix.DownloadManager
    )
  }

  try {
    const { status, error } = await libraryManagerMap[runner]
      .getGame(appName)
      .install({
        path: path.replaceAll("'", ''),
        installDlcs,
        sdlList: sdlList.filter((el) => el !== ''),
        platformToInstall,
        installLanguage,
        build,
        branch
      })

    if (status === 'error') {
      errorMessage(error ?? '')
    }

    return { status, error }
  } catch (error) {
    errorMessage(`${String(error)}`)
    return { status: 'error', error: `${String(error)}` }
  } finally {
    sendGameStatusUpdate({
      appName,
      runner,
      status: 'done'
    })
  }
}

async function updateQueueElement(params: InstallParams): Promise<{
  status: DMStatus
  error?: string | undefined
}> {
  const { appName, runner } = params
  const { title } = libraryManagerMap[runner].getGame(appName).getGameInfo()

  if (!isOnline()) {
    logWarning(
      `App offline, skipping update for game '${title}'.`,
      LogPrefix.Backend
    )
    return { status: 'error' }
  }

  if (await isRefused(runner, 'update', appName)) return { status: 'error' }

  sendGameStatusUpdate({
    appName,
    runner,
    status: 'updating'
  })

  const errorMessage = (error: string) => {
    logError(
      ['Update of', params.appName, 'failed with:', error],
      LogPrefix.DownloadManager
    )
  }

  try {
    const { status, error } = await libraryManagerMap[runner]
      .getGame(appName)
      .update({
        build: params.build,
        branch: params.branch,
        language: params.installLanguage,
        dlcs: params.installDlcs
      })

    if (status === 'error') {
      errorMessage(error ?? '')
    }

    return { status }
  } catch (error) {
    errorMessage(`${String(error)}`)
    return { status: 'error' }
  } finally {
    sendGameStatusUpdate({
      appName,
      runner,
      status: 'done'
    })
  }
}

export { installQueueElement, updateQueueElement }
