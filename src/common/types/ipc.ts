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
  GameAchievement,
  GameInfo,
  GameSettings,
  GameStatus,
  ImportGameArgs,
  InstallInfo,
  InstallParams,
  InstallPlatform,
  KnowFixesInfo,
  MoveGameArgs,
  RecentGame,
  Runner,
  RunnerCommandStub,
  StatusPromise,
  UpdateParams,
  UserInfo
} from '../types'
import type { UserData } from './gog'
import type { AccountsStatus } from 'common/relic/accounts'
import type { LoginInfo, LoginResult } from 'common/relic/login'
import type { NileLoginData, NileRegisterData, NileUserData } from './nile'
import type { GetLogFileArgs } from 'backend/logger/paths'

// ts-prune-ignore-next
interface SyncIPCFunctions {
  changeLanguage: (language: string) => void
  openExternalUrl: (url: string) => void
  openFolder: (folder: string) => void
  openLoginPage: () => void
  openWebviewPage: (url: string) => void
  showConfigFileInFolder: (appName: string) => void
  removeFolder: ([path, folderName]: [string, string]) => void
  clearCache: (showDialog?: boolean, fromVersionChange?: boolean) => void
  clearAchievementCache: (appName: string) => void
  resetRelic: () => void
  logoutGOG: () => void
  logError: (message: unknown) => void
  logInfo: (message: unknown) => void
  removeFromDMQueue: (appName: string) => void
  abort: (id: string) => void
  'connectivity-changed': (newStatus: ConnectivityStatus) => void
  'set-connectivity-online': () => void
  setSetting: (args: {
    appName: string
    key: keyof AppSettings
    value: unknown
  }) => void
  resumeCurrentDownload: () => void
  pauseCurrentDownload: () => void
  cancelDownload: (removeDownloaded: boolean) => void
  changeGameVersionPinnedStatus: (
    appName: string,
    runner: Runner,
    status: boolean
  ) => void
  logoutZoom: () => void
  setGameMetadataOverride: (args: {
    appName: string
    title?: string
    art_cover?: string
    art_square?: string
  }) => void
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
  getMaxCpus: () => number
  getRelicVersion: () => string
  getLegendaryVersion: () => Promise<string>
  getGogdlVersion: () => Promise<string>
  getCometVersion: () => Promise<string>
  getNileVersion: () => Promise<string>
  showUpdateSetting: () => boolean
  getGameInfo: (appName: string, runner: Runner) => Promise<GameInfo | null>
  getAchievements: (
    appName: string,
    runner: Runner,
    lang?: string
  ) => Promise<GameAchievement[]>
  getExtraInfo: (appName: string, runner: Runner) => Promise<ExtraInfo | null>
  getGameSettings: (
    appName: string,
    runner: Runner
  ) => Promise<GameSettings | null>
  getGOGLinuxInstallersLangs: (appName: string) => Promise<string[]>
  getInstallInfo: (
    appName: string,
    runner: Runner,
    installPlatform: InstallPlatform,
    branch?: string,
    build?: string
  ) => Promise<InstallInfo | null>
  getUserInfo: () => Promise<UserInfo | undefined>
  getAmazonUserInfo: () => Promise<NileUserData | undefined>
  getZoomUserInfo: () => Promise<{ username: string } | undefined>
  isLoggedIn: () => boolean
  login: (sid: string) => Promise<{
    status: 'done' | 'failed'
    data: UserInfo | undefined
  }>
  authGOG: (code: string) => Promise<{
    status: 'done' | 'error'
    data?: UserData
  }>
  authAmazon: (data: NileRegisterData) => Promise<{
    status: 'done' | 'failed'
    user: NileUserData | undefined
  }>
  authZoom: (url: string) => Promise<{ status: 'done' | 'error' }>
  logoutLegendary: () => Promise<void>
  logoutAmazon: () => Promise<void>
  readConfig: (config_class: 'library' | 'user') => Promise<GameInfo[] | string>
  getLibrary: (library?: Runner | 'all') => GameInfo[]
  getAccounts: () => AccountsStatus
  getLoginInfo: (runner: Runner) => Promise<LoginInfo>
  submitLogin: (runner: Runner, pasted: string) => Promise<LoginResult>
  requestAppSettings: () => AppSettings
  requestGameSettings: (appName: string) => Promise<GameSettings>
  writeConfig: (args: { appName: string; config: Partial<AppSettings> }) => void
  refreshLibrary: (library?: Runner | 'all') => void
  getRefreshingLibraries: () => Runner[]
  install: (args: InstallParams) => Promise<void>
  uninstall: (
    appName: string,
    runner: Runner,
    shouldRemovePrefix: boolean,
    shoudlRemoveSetting: boolean
  ) => Promise<void>
  repair: (appName: string, runner: Runner) => Promise<void>
  moveInstall: (args: MoveGameArgs) => Promise<void>
  importGame: (args: ImportGameArgs) => StatusPromise
  updateGame: (args: UpdateParams) => Promise<void>
  changeInstallPath: (args: MoveGameArgs) => Promise<void>
  getShellPath: (path: string) => Promise<string>
  isNative: (args: { appName: string; runner: Runner }) => boolean
  getLogContent: (args: GetLogFileArgs) => string
  getKnownFixes: (appName: string, runner: Runner) => KnowFixesInfo | null
  getGameMetadataOverride: (appName: string) => Promise<{
    title?: string
    art_cover?: string
    art_square?: string
  } | null>
  getAllGameOverrides: () => Promise<
    Record<
      string,
      {
        title?: string
        art_cover?: string
        art_square?: string
      }
    >
  >
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
  removeRecent: (appName: string) => Promise<void>
  isGameAvailable: (args: {
    appName: string
    runner: Runner
  }) => Promise<boolean>

  pathExists: (path: string) => Promise<boolean>
  getAmazonLoginData: () => Promise<NileLoginData>
  hasExecutable: (executable: string) => Promise<boolean>

  setPrivateBranchPassword: (appName: string, password: string) => void
  getPrivateBranchPassword: (appName: string) => string

  getAvailableCyberpunkMods: () => Promise<string[]>
  setCyberpunkModConfig: (props: {
    enabled: boolean
    modsToLoad: string[]
  }) => Promise<void>

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
  recentGamesChanged: (newRecentGames: RecentGame[]) => void
  pushGameToLibrary: (info: GameInfo) => void
  progressUpdate: (progress: GameStatus) => void
  metadataChanged: (
    overrides: Record<
      string,
      { title?: string; art_cover?: string; art_square?: string }
    >
  ) => void

  // Used inside tests, so we can be a bit lenient with the type checking here
}

export type {
  SyncIPCFunctions,
  TestSyncIPCFunctions,
  AsyncIPCFunctions,
  FrontendMessages
}
