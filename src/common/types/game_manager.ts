import {
  ExtraInfo,
  GameInfo,
  InstallPlatform,
  ExecResult,
  InstallArgs,
  InstallInfo
} from 'common/types'

export interface InstallResult {
  status: 'done' | 'error' | 'abort'
  error?: string
  /** Where the game was installed, when the store knows it better than its game info yet does */
  installPath?: string
}

export type RemoveArgs = {
  shouldRemovePrefix?: boolean
  deleteFiles?: boolean
}

export interface Game {
  getGameInfo: () => GameInfo
  getExtraInfo: () => Promise<ExtraInfo>
  importGame: (path: string, platform: InstallPlatform) => Promise<ExecResult>
  install: (args: InstallArgs) => Promise<InstallResult>
  moveInstall: (newInstallPath: string) => Promise<InstallResult>
  repair: () => Promise<ExecResult>
  uninstall: (args: RemoveArgs) => Promise<ExecResult>
  update: (updateOverwrites?: {
    build?: string
    branch?: string
    language?: string
    dlcs?: string[]
  }) => Promise<InstallResult>
  forceUninstall: () => Promise<void>
  stop: (stopWine?: boolean) => Promise<void>
  isGameAvailable: () => Promise<boolean>
}

export interface LibraryManager {
  init: () => Promise<void>
  getGame: (id: string) => Game
  refresh: () => Promise<ExecResult | null>
  getGameInfo: (appName: string, forceReload?: boolean) => GameInfo | undefined
  getInstallInfo: (
    appName: string,
    installPlatform: InstallPlatform,
    options: {
      branch?: string
      build?: string
      lang?: string
      retries?: number
    }
  ) => Promise<InstallInfo | undefined>
  listUpdateableGames: () => Promise<string[]>
  changeGameInstallPath: (appName: string, newPath: string) => Promise<void>
  changeVersionPinnedStatus: (appName: string, status: boolean) => void
  /**
   * Why an operation cannot start now (nothing: it can). A store may also get
   * its ground ready here.
   */
  preflight?: (op: PreflightOp, appName: string) => Promise<string | undefined>
  /** Whether the game is in the library: a quick answer for an id of another store */
  hasGame?: (appName: string) => boolean
  /** Adds a game that no list of the store has */
  ensureGame?: (appName: string) => Promise<void>
  /** Forgets what the store keeps on the disk to answer fast (not the installed games) */
  clearCache?: () => void
  /** The DLCs of an install are downloads of their own in the queue */
  queuesDlcs?: boolean
}

export type PreflightOp = 'install' | 'update' | 'import'

/** What `isRefused` is asked about: the operations that talk to the store, repair among them */
export type NetworkOp = PreflightOp | 'repair'
