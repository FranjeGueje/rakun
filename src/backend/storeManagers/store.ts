import type { GameInfo, Runner } from 'common/types'
import type { LibraryManager } from 'common/types/game_manager'
import type { AccountStatus } from 'common/rakun/accounts'
import type { LoginInfo, LoginResult } from 'common/rakun/login'

/** How a store keeps its session on disk and how to check or end it */
export interface StoreSession {
  /** Who is logged in, from local data only (no network) */
  account: () => AccountStatus
  logout: () => Promise<void>
}

/** The two-step login with no embedded browser: show a URL, take back a code */
interface StoreLogin {
  /** Parameter of the final address that carries the code */
  urlParam: string
  start: () => Promise<LoginInfo>
  submit: (code: string) => Promise<LoginResult>
}

/**
 * Everything the rest of rakun needs to know about a store. Adding a store is
 * a folder under `storeManagers/` with its own `store.ts` plus one line in the
 * registry (`storeManagers/index.ts`).
 */
export interface Store<Library extends LibraryManager = LibraryManager> {
  id: Runner
  /** Name clients use: `epic`, `gog`, `amazon`, `zoom` */
  name: string
  label: string
  library: Library
  /** The games as last refreshed, with their install state */
  readLibrary: () => GameInfo[]
  session: StoreSession
  login: StoreLogin
}
