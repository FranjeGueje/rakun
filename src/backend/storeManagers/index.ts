import { gog } from 'backend/storeManagers/gog/store'
import { legendary } from 'backend/storeManagers/legendary/store'
import { nile } from 'backend/storeManagers/nile/store'
import { zoom } from 'backend/storeManagers/zoom/store'

import { logInfo, RunnerToLogPrefixMap } from 'backend/logger'
import { addToQueue } from 'backend/downloadmanager/downloadqueue'

import type { DMQueueElement, GameInfo, Runner } from 'common/types'
import type { Store } from './store'

/**
 * Every store relicd supports: a new one is added here and nowhere else. The
 * order is the one clients show them in.
 */
export const stores = { legendary, gog, nile, zoom } satisfies Record<
  Runner,
  Store
>

export const RUNNERS = Object.keys(stores) as Runner[]

/** The store for a name a client sent, which may not be one of ours */
export function getStore(runner: string): Store {
  if (!Object.hasOwn(stores, runner)) {
    throw new Error(`Unknown store "${runner}"`)
  }
  return stores[runner as Runner]
}

export const libraryManagerMap = Object.fromEntries(
  Object.values(stores).map((store) => [store.id, store.library])
) as { [R in Runner]: (typeof stores)[R]['library'] }

function getDMElement(gameInfo: GameInfo, appName: string) {
  const {
    install: { install_path, platform },
    runner
  } = gameInfo
  const dmQueueElement: DMQueueElement = {
    params: {
      appName,
      gameInfo,
      runner,
      path: install_path!,
      platformToInstall: platform!
    },
    type: 'update',
    addToQueueTime: Date.now(),
    endTime: 0,
    startTime: 0
  }
  return dmQueueElement
}

export function autoUpdate(runner: Runner, gamesToUpdate: string[]) {
  const logPrefix = RunnerToLogPrefixMap[runner]
  gamesToUpdate.forEach(async (appName) => {
    const game = libraryManagerMap[runner].getGame(appName)
    const { ignoreGameUpdates } = await game.getSettings()
    const gameInfo = game.getGameInfo()
    const gameIsAvailable = await game.isGameAvailable()
    if (!ignoreGameUpdates && gameIsAvailable) {
      logInfo(`Auto-Updating ${gameInfo.title}`, logPrefix)
      const dmQueueElement: DMQueueElement = getDMElement(gameInfo, appName)
      void addToQueue(dmQueueElement)
      // remove from the array to avoid downloading the same game twice
      gamesToUpdate = gamesToUpdate.filter((game) => game !== appName)
    } else {
      logInfo(`Skipping auto-update for ${gameInfo.title}`, logPrefix)
    }
  })
  return gamesToUpdate
}

export async function initStoreManagers() {
  return Promise.all(
    Object.values(libraryManagerMap).map((manager) => manager.init())
  )
}
