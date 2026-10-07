import { gog } from 'backend/storeManagers/gog/store'
import { legendary } from 'backend/storeManagers/legendary/store'
import { nile } from 'backend/storeManagers/nile/store'
import { zoom } from 'backend/storeManagers/zoom/store'

import { logError, logInfo, RunnerToLogPrefixMap } from 'backend/logger'
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

/** Queues the update of one game; false when it could not be queued */
async function queueUpdate(runner: Runner, appName: string): Promise<boolean> {
  const logPrefix = RunnerToLogPrefixMap[runner]
  try {
    const game = libraryManagerMap[runner].getGame(appName)
    const gameInfo = game.getGameInfo()
    if (!(await game.isGameAvailable())) {
      logInfo(`Skipping auto-update for ${gameInfo.title}`, logPrefix)
      return false
    }
    logInfo(`Auto-Updating ${gameInfo.title}`, logPrefix)
    // Queueing asks the store for the download size: do not wait for it here
    addToQueue(getDMElement(gameInfo, appName)).catch((error: unknown) =>
      logError([`Could not queue ${appName}:`, error], logPrefix)
    )
    return true
  } catch (error) {
    logError([`Auto-update of ${appName} failed:`, error], logPrefix)
    return false
  }
}

/**
 * Queues the update of every game that can be updated and returns the ones
 * that were not queued, which the user still has to update by hand.
 */
export async function autoUpdate(
  runner: Runner,
  gamesToUpdate: string[]
): Promise<string[]> {
  const queued = await Promise.all(
    gamesToUpdate.map((appName) => queueUpdate(runner, appName))
  )
  return gamesToUpdate.filter((_, index) => !queued[index])
}

export async function initStoreManagers() {
  return Promise.all(
    Object.values(libraryManagerMap).map((manager) => manager.init())
  )
}
