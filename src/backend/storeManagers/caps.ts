import type { Runner } from 'common/types'
import type { StoreCaps } from 'common/rakun/stores'

const upper: StoreCaps = {
  import: true,
  lowercasePlatform: false,
  directLaunch: false
}
const lower: StoreCaps = { ...upper, lowercasePlatform: true }

/**
 * What each store can do. Plain data on purpose (no store code is loaded to
 * read it); a new store has to say here, because the compiler asks for it.
 */
export const STORE_CAPS: Record<Runner, StoreCaps> = {
  legendary: upper,
  nile: upper,
  gog: lower,
  zoom: { ...lower, import: false, directLaunch: true },
  itch: { ...lower, import: false }
}
