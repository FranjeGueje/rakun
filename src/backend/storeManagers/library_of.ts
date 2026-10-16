import { libraryManagerMap } from 'backend/storeManagers'
import type { Runner } from 'common/types'
import type { LibraryManager } from 'common/types/game_manager'

/** The library of a store seen through the common contract, where the optional parts show */
export const libraryOf = (runner: Runner): LibraryManager =>
  libraryManagerMap[runner]
