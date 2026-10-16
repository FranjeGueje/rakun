import { STORE_CAPS } from 'backend/storeManagers/caps'
import type { Runner } from 'common/types'

/**
 * Stores whose game Steam runs as it is, with no runner in between: the shortcut
 * points at the executable itself and the prefix is the game's own folder (the
 * `directLaunch` capability). Only Zoom, whose installers build the prefix
 * inside it; every other store goes through the runner (`.bat`) and a prefix of
 * its own.
 */
export const runsExecutableDirectly = (store: Runner): boolean =>
  STORE_CAPS[store].directLaunch
