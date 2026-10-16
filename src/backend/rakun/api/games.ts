import type { StatusPromise } from 'common/types'
import { existsSync, watch } from 'fs'
import { addHandler, addListener } from 'backend/ipc'
import { GlobalConfig } from 'backend/config'
import { sendGameStatusUpdate } from 'backend/utils'
import { isRefused } from 'backend/storeManagers/preflight'
import { libraryOf } from 'backend/storeManagers/library_of'
import { uninstallGameCallback } from 'backend/utils/uninstaller'
import {
  logError,
  logInfo,
  LogPrefix,
  logWarning,
  RunnerToLogPrefixMap
} from 'backend/logger'
import { isOnline } from 'backend/online_monitor'
import { showDialogBoxModalAuto } from 'backend/dialog/dialog'
import { callAbortController } from 'backend/utils/aborthandler/aborthandler'
import { autoUpdate, libraryManagerMap } from 'backend/storeManagers'
import { legendaryInstalled } from 'backend/storeManagers/legendary/constants'
import {
  onGameImported,
  onGameMoved,
  onGameRepaired
} from 'backend/rakun/game_events'
import { refreshingRunners, startRefresh } from './refresh'
import { shareInFlight } from 'backend/utils/inflight'

/** The web asks again each time a store reports a refresh: those asking while a check runs share it */
const updateChecks = new Map<string, Promise<string[]>>()

addHandler('checkGameUpdates', () =>
  shareInFlight(updateChecks, 'all', checkGameUpdates)
)

async function checkGameUpdates(): Promise<string[]> {
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
}

addHandler('isGameAvailable', async (e, args) => {
  const { appName, runner } = args
  return libraryManagerMap[runner].getGame(appName).isGameAvailable()
})

addHandler('getGameInfo', async (event, appName, runner) => {
  // Fastpath since we sometimes have to request info for a GOG game as Legendary because we don't know it's a GOG game yet
  if (libraryOf(runner).hasGame?.(appName) === false) return null
  // A game that is in none of the user's lists (itch.io) is added by its id
  await libraryOf(runner).ensureGame?.(appName)
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
  if (libraryOf(runner).hasGame?.(appName) === false) return null
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
      logError(error, RunnerToLogPrefixMap[runner])
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
  if (await isRefused(runner, 'repair', appName)) return

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

    const game = libraryOf(runner).getGame(appName)
    const moveRes = await game.moveInstall(path)
    if (moveRes.status === 'error') {
      logError(
        `Error while moving ${appName} to ${path}: ${moveRes.error} `,
        LogPrefix.Backend
      )

      showDialogBoxModalAuto({
        title: 'Error',
        message: `Error Moving Game ${moveRes.error}`,
        type: 'ERROR'
      })
    }

    if (moveRes.status === 'done') {
      logInfo(`Finished moving ${appName} to ${path}.`, LogPrefix.Backend)
      if (moveRes.installPath) {
        void onGameMoved(game, moveRes.installPath).catch((err) =>
          logError(err, LogPrefix.Backend)
        )
      }
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
    if (await isRefused(runner, 'import', appName)) return { status: 'error' }

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

    const game = libraryOf(runner).getGame(appName)
    try {
      const { abort, error } = await game.importGame(path, platform)
      if (abort || error) {
        abortMessage()
        // An abort is not a failure: whoever asked for it knows
        return { status: error ? 'error' : 'done' }
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
    void onGameImported(game).catch((err) => logError(err, LogPrefix.Backend))
    return { status: 'done' }
  }
)

addHandler('kill', async (event, appName, runner) => {
  if (!/^[\w.-]+$/.test(appName)) {
    throw new Error(`Invalid app name '${appName}'`)
  }
  callAbortController(appName)
  return libraryManagerMap[runner].getGame(appName).stop()
})

addListener('changeGameVersionPinnedStatus', (e, appName, runner, status) => {
  libraryManagerMap[runner].changeVersionPinnedStatus(appName, status)
})
