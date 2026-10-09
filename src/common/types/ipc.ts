import type {
  AppSettings,
  ButtonOptions,
  ConnectivityStatus,
  DialogType,
  DMQueueElement,
  DownloadManagerState,
  ExtraInfo,
  GameInfo,
  GameStatus,
  ImportGameArgs,
  InstallInfo,
  InstallParams,
  InstallPlatform,
  MoveGameArgs,
  Runner,
  StatusPromise,
  UpdateParams
} from '../types'
import type { AccountsStatus } from 'common/rakun/accounts'
import type { FolderListing } from 'common/rakun/folders'
import type { LoginInfo, LoginResult } from 'common/rakun/login'
import type { StoreInfo } from 'common/rakun/stores'
import type { HelpersUpdate, HelperInfo } from 'common/rakun/helpers'
import type { UpdateableGame } from 'common/rakun/updates'
import type { GetLogFileArgs } from 'backend/logger/paths'

// ts-prune-ignore-next
interface SyncIPCFunctions {
  removeFromDMQueue: (appName: string) => void
  clearFinishedDMQueue: () => void
  clearCache: (library?: Runner) => void
  resetRakun: () => void
  stopRakun: () => void
  setSetting: (args: { key: keyof AppSettings; value: unknown }) => void
  resumeCurrentDownload: () => void
  pauseCurrentDownload: () => void
  cancelDownload: (removeDownloaded: boolean) => void
  changeGameVersionPinnedStatus: (
    appName: string,
    runner: Runner,
    status: boolean
  ) => void
}

// ts-prune-ignore-next
interface AsyncIPCFunctions {
  kill: (appName: string, runner: Runner) => Promise<void>
  checkGameUpdates: () => Promise<string[]>
  getUpdateableGames: () => Promise<UpdateableGame[]>
  getHelpers: () => Promise<HelperInfo[]>
  updateHelpers: (args: { latest?: boolean }) => Promise<HelpersUpdate>
  getRakunVersion: () => string
  getGameInfo: (appName: string, runner: Runner) => Promise<GameInfo | null>
  getExtraInfo: (appName: string, runner: Runner) => Promise<ExtraInfo | null>
  getGOGLinuxInstallersLangs: (appName: string) => Promise<string[]>
  getInstallInfo: (
    appName: string,
    runner: Runner,
    installPlatform: InstallPlatform,
    branch?: string,
    build?: string
  ) => Promise<InstallInfo | null>
  getLibrary: (library?: Runner | 'all') => GameInfo[]
  getStores: () => StoreInfo[]
  listFolders: (path?: string) => FolderListing
  getAccounts: () => AccountsStatus
  logout: (runner: Runner) => Promise<void>
  getLoginInfo: (runner: Runner) => Promise<LoginInfo>
  submitLogin: (runner: Runner, pasted: string) => Promise<LoginResult>
  requestAppSettings: () => AppSettings
  getMaxCpus: () => number
  writeConfig: (config: Partial<AppSettings>) => void
  refreshLibrary: (library?: Runner | 'all') => void
  getRefreshingLibraries: () => Runner[]
  install: (args: InstallParams) => Promise<void>
  uninstall: (
    appName: string,
    runner: Runner,
    shouldRemovePrefix: boolean
  ) => Promise<void>
  repair: (appName: string, runner: Runner) => Promise<void>
  moveInstall: (args: MoveGameArgs) => Promise<void>
  importGame: (args: ImportGameArgs) => StatusPromise
  updateGame: (args: UpdateParams) => Promise<void>
  getLogContent: (args: GetLogFileArgs) => string
  getDMQueueInformation: () => {
    elements: DMQueueElement[]
    finished: DMQueueElement[]
    state: DownloadManagerState
  }
  isGameAvailable: (args: {
    appName: string
    runner: Runner
  }) => Promise<boolean>

  'steamgriddb.hasApiKey': () => Promise<boolean>
  'steamgriddb.setApiKey': (key: string) => Promise<void>
}

interface FrontendMessages {
  gameStatusUpdate: (status: GameStatus) => void
  showDialog: (
    title: string,
    message: string,
    type: DialogType,
    buttons?: Array<ButtonOptions>
  ) => void
  changedDMQueueInformation: (
    elements: DMQueueElement[],
    state: DownloadManagerState
  ) => void
  refreshLibrary: (runner?: Runner) => void
  'connectivity-changed': (status: {
    status: ConnectivityStatus
    retryIn: number
  }) => void
  pushGameToLibrary: (info: GameInfo) => void
  progressUpdate: (progress: GameStatus) => void
  helpersProgress: (line: string) => void

  // Used inside tests, so we can be a bit lenient with the type checking here
}

export type { SyncIPCFunctions, AsyncIPCFunctions, FrontendMessages }
