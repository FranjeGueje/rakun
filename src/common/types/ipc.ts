import type { SystemInformation } from 'backend/utils/systeminfo'

import type {
  AppSettings,
  ButtonOptions,
  ConnectivityStatus,
  DialogType,
  DiskSpaceData,
  DMQueueElement,
  DownloadManagerState,
  ExtraInfo,
  GameInfo,
  GameStatus,
  ImportGameArgs,
  InstallInfo,
  InstallParams,
  InstallPlatform,
  KnowFixesInfo,
  MoveGameArgs,
  Runner,
  RunnerCommandStub,
  StatusPromise,
  UpdateParams
} from '../types'
import type { AccountsStatus, SessionsImport } from 'common/relic/accounts'
import type { LoginInfo, LoginResult } from 'common/relic/login'
import type { StoreInfo } from 'common/relic/stores'
import type { GetLogFileArgs } from 'backend/logger/paths'

// ts-prune-ignore-next
interface SyncIPCFunctions {
  removeFromDMQueue: (appName: string) => void
  'set-connectivity-online': () => void
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

/*
 * These events should only be used during tests to stub/mock
 *
 * We have to handle them in another interface because these
 * events don't have an IpcMainEvent first argument when handled
 */
interface TestSyncIPCFunctions {
  setLegendaryCommandStub: (stubs: RunnerCommandStub[]) => void
  resetLegendaryCommandStub: () => void
  setGogdlCommandStub: (stubs: RunnerCommandStub[]) => void
  resetGogdlCommandStub: () => void
  setNileCommandStub: (stubs: RunnerCommandStub[]) => void
  resetNileCommandStub: () => void
}

// ts-prune-ignore-next
interface AsyncIPCFunctions {
  kill: (appName: string, runner: Runner) => Promise<void>
  checkDiskSpace: (folder: string) => Promise<DiskSpaceData>
  checkGameUpdates: () => Promise<string[]>
  getEpicGamesStatus: () => Promise<boolean>
  getRelicVersion: () => string
  getLegendaryVersion: () => Promise<string>
  getGogdlVersion: () => Promise<string>
  getCometVersion: () => Promise<string>
  getNileVersion: () => Promise<string>
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
  getAccounts: () => AccountsStatus
  logout: (runner: Runner) => Promise<void>
  importSessionsFromRelic: () => Promise<SessionsImport>
  getLoginInfo: (runner: Runner) => Promise<LoginInfo>
  submitLogin: (runner: Runner, pasted: string) => Promise<LoginResult>
  requestAppSettings: () => AppSettings
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
  changeInstallPath: (args: MoveGameArgs) => Promise<void>
  isNative: (args: { appName: string; runner: Runner }) => boolean
  getLogContent: (args: GetLogFileArgs) => string
  getKnownFixes: (appName: string, runner: Runner) => KnowFixesInfo | null
  getDMQueueInformation: () => {
    elements: DMQueueElement[]
    finished: DMQueueElement[]
    state: DownloadManagerState
  }
  'get-connectivity-status': () => {
    status: ConnectivityStatus
    retryIn: number
  }
  getSystemInfo: (cache?: boolean) => Promise<SystemInformation>
  isGameAvailable: (args: {
    appName: string
    runner: Runner
  }) => Promise<boolean>

  setPrivateBranchPassword: (appName: string, password: string) => void
  getPrivateBranchPassword: (appName: string) => string

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

  // Used inside tests, so we can be a bit lenient with the type checking here
}

export type {
  SyncIPCFunctions,
  TestSyncIPCFunctions,
  AsyncIPCFunctions,
  FrontendMessages
}
