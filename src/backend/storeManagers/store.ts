import type { GameInfo, Runner } from 'common/types'
import type { LibraryManager } from 'common/types/game_manager'
import type { AccountStatus } from 'common/relic/accounts'
import type { LoginInfo, LoginResult } from 'common/relic/login'

/** How a store keeps its session on disk and how to check or end it */
export interface StoreSession {
  /** Folder where the store keeps its credentials (Relic uses the same layout) */
  dir: string
  /** File inside `dir` whose presence means there is a session */
  main: string
  /** Credential files to copy, by name, from `dir` in Relic's config */
  files: (relicDir: string) => string[]
  /** Who is logged in, from local data only (no network) */
  account: () => AccountStatus
  /** Asks the store whether the credentials just copied are accepted */
  isAccepted: () => Promise<boolean>
  /** Undoes a copy the store did not accept */
  discard: (copied: string[]) => void
  logout: () => Promise<void>
}

/** The two-step login with no embedded browser: show a URL, take back a code */
export interface StoreLogin {
  /** Parameter of the final address that carries the code */
  urlParam: string
  start: () => Promise<LoginInfo>
  submit: (code: string) => Promise<LoginResult>
}

/**
 * Everything the rest of relicd needs to know about a store. Adding a store is
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
