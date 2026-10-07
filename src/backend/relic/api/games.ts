import type { StatusPromise } from 'common/types'
import { existsSync, watch } from 'fs'
import i18next from 'i18next'
import { addHandler, addListener } from 'backend/ipc'
import { GlobalConfig } from 'backend/config'
import { isEpicServiceOffline, sendGameStatusUpdate } from 'backend/utils'
import { uninstallGameCallback } from 'backend/utils/uninstaller'
import { logError, logInfo, LogPrefix, logWarning } from 'backend/logger'
import { readKnownFixes } from 'backend/relic/known_fixes'
import { isOnline } from 'backend/online_monitor'
import { showDialogBoxModalAuto } from 'backend/dialog/dialog'
import { callAbortController } from 'backend/utils/aborthandler/aborthandler'
import { autoUpdate, libraryManagerMap } from 'backend/storeManagers'
import { legendaryInstalled } from 'backend/storeManagers/legendary/constants'
import { onGameRepaired } from 'backend/relic/game_events'
import { refreshingRunners, startRefresh } from './refresh'

addHandler('checkGameUpdates', async (): Promise<string[]> => {
  let oldGames: string[] = []
  const { autoUpdateGames } = GlobalConfig.get().getSettings()
  for (const runner of Object.keys(
    libraryManagerMap
  ) as (keyof typeof libraryManagerMap)[]) {
    let gamesToUpdate = await libraryManagerMap[runner].listUpdateableGames()
    if (autoUpdateGames) {
      gamesToUpdate = await autoUpdate(runner, gamesToUpdate)
    }
    oldGames = [...oldGames, ...gamesToUpdate]
  }

  return oldGames
})

addHandler('isGameAvailable', async (e, args) => {
  const { appName, runner } = args
  return libraryManagerMap[runner].getGame(appName).isGameAvailable()
})

addHandler('getGameInfo', (event, appName, runner) => {
  // Fastpath since we sometimes have to request info for a GOG game as Legendary because we don't know it's a GOG game yet
  if (
    runner === 'legendary' &&
    !libraryManagerMap['legendary'].hasGame(appName)
  ) {
    return null
  }
  const tempGameInfo = libraryManagerMap[runner].getGame(appName).getGameInfo()
  // The game managers return an empty object if they couldn't fetch the game
  // info, since most of the backend assumes getting it can never fail (and
  // an empty object is a little easier to work with than `null`)
  // The frontend can however handle being passed an explicit `null` value, so
  // we return that here instead if the game info is empty
  if (!Object.keys(tempGameInfo).length) return null
  return tempGameInfo
})

addHandler('getExtraInfo', async (event, appName, runner) => {
  // Fastpath since we sometimes have to request info for a GOG game as Legendary because we don't know it's a GOG game yet
  if (
    runner === 'legendary' &&
    !libraryManagerMap['legendary'].hasGame(appName)
  ) {
    return null
  }
  return libraryManagerMap[runner].getGame(appName).getExtraInfo()
})

addHandler('getGOGLinuxInstallersLangs', async (event, appName) =>
  libraryManagerMap['gog'].getLinuxInstallersLanguages(appName)
)

addHandler(
  'getInstallInfo',
  async (event, appName, runner, installPlatform, build, branch) => {
    try {
      const info = await libraryManagerMap[runner].getInstallInfo(
        appName,
        installPlatform,
        {
          branch,
          build
        }
      )
      if (info === undefined) return null
      return info
    } catch (error) {
      logError(
        error,
        runner === 'legendary'
          ? LogPrefix.Legendary
          : runner === 'nile'
            ? LogPrefix.Nile
            : LogPrefix.Gog
      )
      return null
    }
  }
)

// Watch the installed games file and trigger a refresh on the installed games if something changes
if (existsSync(legendaryInstalled)) {
  let watchTimeout: NodeJS.Timeout | undefined
  watch(legendaryInstalled, () => {
    logInfo('installed.json updated, refreshing library', LogPrefix.Legendary)
    // `watch` might fire twice (while Legendary/we are still writing chunks of the file), which would in turn make LegendaryLibrary fail to
    // decode the JSON data. So instead of immediately calling LegendaryLibrary.get().refreshInstalled(), call it only after no writes happen
    // in a 500ms timespan
    if (watchTimeout) clearTimeout(watchTimeout)
    watchTimeout = setTimeout(
      () => libraryManagerMap['legendary'].refreshInstalled(),
      500
    )
  })
}

// Starts the refresh and answers at once: it ends with a `refreshLibrary` event
addHandler('refreshLibrary', (_e, library) => startRefresh(library))

addHandler('getRefreshingLibraries', () => refreshingRunners())

addHandler('uninstall', uninstallGameCallback)

addHandler('repair', async (event, appName, runner) => {
  if (!isOnline()) {
    logWarning(
      `App offline, skipping repair for game '${appName}'.`,
      LogPrefix.Backend
    )
    return
  }

  sendGameStatusUpdate({
    appName,
    runner,
    status: 'repairing'
  })

  const game = libraryManagerMap[runner].getGame(appName)

  try {
    const res = await game.repair()
    if (!res.error) {
      await onGameRepaired(game)
    }
  } catch (error) {
    logError(error, LogPrefix.Backend)
  }
  logInfo('Finished repairing', LogPrefix.Backend)

  sendGameStatusUpdate({
    appName,
    runner,
    status: 'done'
  })
})

addHandler(
  'moveInstall',
  async (event, { appName, path, runner }): Promise<void> => {
    sendGameStatusUpdate({
      appName,
      runner,
      status: 'moving'
    })

    const moveRes = await libraryManagerMap[runner]
      .getGame(appName)
      .moveInstall(path)
    if (moveRes.status === 'error') {
      logError(
        `Error while moving ${appName} to ${path}: ${moveRes.error} `,
        LogPrefix.Backend
      )

      showDialogBoxModalAuto({
        title: i18next.t('box.error.title', 'Error'),
        message: i18next.t('box.error.moving', 'Error Moving Game {{error}}', {
          error: moveRes.error
        }),
        type: 'ERROR'
      })
    }

    if (moveRes.status === 'done') {
      logInfo(`Finished moving ${appName} to ${path}.`, LogPrefix.Backend)
    }

    sendGameStatusUpdate({
      appName,
      runner,
      status: 'done'
    })
  }
)

addHandler(
  'importGame',
  async (event, { appName, path, runner, platform }): StatusPromise => {
    if (runner === 'legendary') {
      const epicOffline = await isEpicServiceOffline()
      if (epicOffline) {
        showDialogBoxModalAuto({
          title: i18next.t('box.warning.title', 'Warning'),
          message: i18next.t(
            'box.warning.epic.import',
            'Epic Servers are having major outage right now, the game cannot be imported!'
          ),
          type: 'ERROR'
        })
        return { status: 'error' }
      }
    }

    const { title } = libraryManagerMap[runner].getGame(appName).getGameInfo()
    sendGameStatusUpdate({
      appName,
      runner,
      status: 'importing'
    })

    const abortMessage = () => {
      sendGameStatusUpdate({
        appName,
        runner,
        status: 'done'
      })
    }

    try {
      const { abort, error } = await libraryManagerMap[runner]
        .getGame(appName)
        .importGame(path, platform)
      if (abort || error) {
        abortMessage()
        return { status: 'done' }
      }
    } catch (error) {
      abortMessage()
      logError(error, LogPrefix.Backend)
      return { status: 'error' }
    }

    sendGameStatusUpdate({
      appName,
      runner,
      status: 'done'
    })
    logInfo(`imported ${title}`, LogPrefix.Backend)
    return { status: 'done' }
  }
)

addHandler('kill', async (event, appName, runner) => {
  callAbortController(appName)
  return libraryManagerMap[runner].getGame(appName).stop()
})

addHandler('changeInstallPath', async (event, { appName, path, runner }) => {
  await libraryManagerMap[runner].changeGameInstallPath(appName, path)
  logInfo(
    `Finished changing install path of ${appName} to ${path}.`,
    LogPrefix.Backend
  )
})

addHandler('isNative', (e, { appName, runner }) => {
  return libraryManagerMap[runner].getGame(appName).isNative()
})

addHandler('getPrivateBranchPassword', (e, appName) =>
  libraryManagerMap['gog'].getGame(appName).getBranchPassword()
)
addHandler('setPrivateBranchPassword', (e, appName, password) =>
  libraryManagerMap['gog'].getGame(appName).setBranchPassword(password)
)

addListener('changeGameVersionPinnedStatus', (e, appName, runner, status) => {
  libraryManagerMap[runner].changeVersionPinnedStatus(appName, status)
})

addHandler('getKnownFixes', (e, appName, runner) =>
  readKnownFixes(appName, runner)
)
