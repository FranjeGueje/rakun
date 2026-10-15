/**
 * Stores whose game Steam runs as it is, with no runner in between: the shortcut
 * points at the executable itself and the prefix is the game's own folder. Only
 * Zoom, whose installers build the prefix inside it; every other store goes through
 * the runner (`.bat`) and a prefix of its own.
 */
export const runsExecutableDirectly = (store: string): boolean =>
  store === 'zoom'
