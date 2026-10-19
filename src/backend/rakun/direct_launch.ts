import { STORE_CAPS } from 'backend/storeManagers/caps'
import type { Runner } from 'common/types'

/**
 * The prefix of Steam is the game's own folder (the `directLaunch` capability):
 * Zoom's installers build the prefix inside it, so its games keep the prefix where
 * the game is, not in a folder of Steam's.
 */
export const prefixIsGameFolder = (store: Runner): boolean =>
  STORE_CAPS[store].directLaunch
