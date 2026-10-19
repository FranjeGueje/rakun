import type { Runner } from 'common/types'

/** What a store can do and how it differs from the others; clients ask this instead of naming stores */
export type StoreCaps = {
  /** A game that is already on the disk can be registered */
  import: boolean
  /** An installed game can be updated to a newer version */
  update: boolean
  /** An installed game can be repaired */
  repair: boolean
  /** The platform is sent as `windows`, not `Windows` */
  lowercasePlatform: boolean
  /** The prefix of the game is its own folder (Zoom's installers build it there), not one of Steam's */
  directLaunch: boolean
  /** A Windows game can be installed now (interactive) or on its first launch from Steam */
  installModes: boolean
}

/** What a client needs to list and name a store */
export type StoreInfo = {
  id: Runner
  /** Short name to type or show: `epic`, `gog`, `amazon`, `zoom` */
  name: string
  label: string
  caps: StoreCaps
}
