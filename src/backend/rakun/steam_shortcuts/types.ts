import type { Runner } from 'common/types'

export type GameRunner = Runner

export interface AddGameToSteamOptions {
  gameName: string
  runnerPath: string
}

export interface AddGameToSteamResult {
  success: boolean
  steamAppId?: number
  error?: string
}

export interface SteamShortcut {
  gameName: string
  appId: string
  store: GameRunner
  steamAppId: number
  installPath: string
  execPath: string
}

export interface UserdataInfo {
  userdataDir: string
  folders: string[]
}

export interface FindResult {
  entry: Record<string, unknown> | null
  found: boolean
  error?: string
}
