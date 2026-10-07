import type { Runner } from 'common/types'

/** What a client needs to list and name a store */
export type StoreInfo = {
  id: Runner
  /** Short name to type or show: `epic`, `gog`, `amazon`, `zoom` */
  name: string
  label: string
}
