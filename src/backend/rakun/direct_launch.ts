/**
 * Stores whose games Steam runs as they are, with no launcher of the store in
 * between (DRM-free ones): the shortcut points at the executable itself.
 */
export const runsExecutableDirectly = (store: string): boolean =>
  store === 'zoom' || store === 'itch'
