import { libraryManagerMap } from 'backend/storeManagers'
import type { Runner } from 'common/types'
import type { LibraryManager } from 'common/types/game_manager'

/**
 * The library of a store seen through the common contract, where the optional
 * parts show. `runner` may come from a client: one that is not a store is refused.
 */
export function libraryOf(runner: Runner): LibraryManager {
  if (!Object.hasOwn(libraryManagerMap, runner))
    throw new Error(`Unknown store "${runner}"`)
  return libraryManagerMap[runner]
}
