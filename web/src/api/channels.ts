import type {
  AccountsStatus,
  AppSettings,
  FolderListing,
  GameInfo,
  InstallParams,
  LoginInfo,
  LoginResult,
  QueueInfo,
  Runner,
  SettingKey,
  StoreInfo,
  UpdateParams
} from './types'

/**
 * The channels of relicd the interface calls, with their arguments and what
 * they answer (the contract is relicd's API.md; relicd decides what is exposed).
 */
export type CallMap = {
  getStores: { args: []; result: StoreInfo[] }
  getLibrary: { args: [Runner | 'all']; result: GameInfo[] }
  getAccounts: { args: []; result: AccountsStatus }
  listFolders: { args: [path?: string]; result: FolderListing }
  logout: { args: [Runner]; result: null }
  refreshLibrary: { args: [Runner | 'all']; result: null }
  checkGameUpdates: { args: []; result: string[] }
  requestAppSettings: { args: []; result: AppSettings }
  install: { args: [InstallParams]; result: null }
  updateGame: { args: [UpdateParams]; result: null }
  repair: { args: [string, Runner]; result: null }
  uninstall: { args: [string, Runner, boolean]; result: null }
  getDMQueueInformation: { args: []; result: QueueInfo }
  pauseCurrentDownload: { args: []; result: null }
  resumeCurrentDownload: { args: []; result: null }
  cancelDownload: { args: [boolean]; result: null }
  removeFromDMQueue: { args: [string]; result: null }
  clearFinishedDMQueue: { args: []; result: null }
  getLoginInfo: { args: [Runner]; result: LoginInfo }
  submitLogin: { args: [Runner, string]; result: LoginResult }
  setSetting: { args: [{ key: SettingKey; value: string }]; result: null }
}

export type CallChannel = keyof CallMap

/** The events of relicd (`GET /events`) the client listens to */
export const EVENT_CHANNELS = [
  'gameStatusUpdate',
  'progressUpdate',
  'changedDMQueueInformation',
  'pushGameToLibrary',
  'refreshLibrary',
  'showDialog'
] as const

export type EventChannel = (typeof EVENT_CHANNELS)[number]

export type RelicdEvent = { event: EventChannel; args: unknown[] }

/** `offline`: relicd does not answer (stopped, or the port changed) */
export type ConnectionState = 'connecting' | 'online' | 'offline'

export function isEventChannel(event: string): event is EventChannel {
  return (EVENT_CHANNELS as readonly string[]).includes(event)
}
