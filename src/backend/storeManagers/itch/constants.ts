import { join } from 'path'
import { userDataPath } from 'backend/constants/paths'

const itchSupportPath = join(userDataPath, 'itch_store')
export const butlerDbPath = join(itchSupportPath, 'butler.db')

/** rakun's OAuth application on itch.io: public, any user can authorize it (no secret: the login uses PKCE) */
export const ITCH_CLIENT_ID = '383082c7e212e8f812c8b584887a7bdb'
/**
 * What rakun asks the user to allow, and no more (not `profile`, which also gives the
 * games they develop). itch.io grants no others over OAuth: `collection:view` and
 * `game:view`, which the API names when a call lacks them, are refused as "Invalid scope".
 */
export const ITCH_SCOPES = [
  'profile:me', // who is logged in
  'profile:owned', // the games they own or have claimed
  'profile:collections', // the list of their collections (not the games in them)
  'game:view:uploads' // the files of a game, to download them
]
/** The `scope` parameter: the scopes separated by spaces */
export const ITCH_SCOPE = ITCH_SCOPES.join(' ')
export const ITCH_AUTHORIZE_URL = 'https://itch.io/user/oauth'
export const ITCH_TOKEN_URL = 'https://api.itch.io/oauth/token'
export const ITCH_REVOKE_URL = 'https://api.itch.io/oauth/revoke'
/** Where itch.io sends the browser back to: rakun's own API, on this machine (the port does not have to match the registered one, the rest does) */
export const ITCH_CALLBACK_PATH = '/itch/callback'
/** How long the user has to authorize rakun before the login is forgotten */
export const ITCH_LOGIN_TTL_MS = 10 * 60 * 1000
