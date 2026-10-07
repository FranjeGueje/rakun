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
  isNative: () => boolean
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
}
