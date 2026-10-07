import type { UpdateableGame } from 'common/rakun/updates'
import type { Runner } from 'common/types'
import { addHandler } from 'backend/ipc'
import { logError, RunnerToLogPrefixMap } from 'backend/logger'
import { RUNNERS, stores } from 'backend/storeManagers'

/** The games of one store (or all of them) as last refreshed, with install state */
addHandler('getLibrary', (_e, library = 'all') => {
  const runners = library === 'all' ? RUNNERS : [library]
  return runners.flatMap((runner) => stores[runner].readLibrary())
})

/** One store's updateable games; a store that fails is a store with nothing to update */
async function updateableIn(runner: Runner): Promise<UpdateableGame[]> {
  try {
    const appNames = await stores[runner].library.listUpdateableGames()
    return appNames.map((appName) => ({ runner, appName }))
  } catch (error) {
    logError(
      [`Could not list the updates of ${runner}:`, error],
      RunnerToLogPrefixMap[runner]
    )
    return []
  }
}

/** Unlike `checkGameUpdates` it names the store and queues nothing */
addHandler('getUpdateableGames', async () =>
  (await Promise.all(RUNNERS.map(updateableIn))).flat()
)
