import type { GameInstallInfo, GameManifest } from './zoom'

/** The platforms butlerd reports for a game or an upload (`windows`, `linux`, `osx`) */
export type ItchPlatforms = Partial<Record<'windows' | 'linux' | 'osx', string>>

/** Subset of butlerd's `Game` that rakun reads */
export interface ItchGame {
  id: number
  url: string
  title: string
  shortText?: string
  coverUrl?: string
  stillCoverUrl?: string
  platforms?: ItchPlatforms
  user?: { username?: string; displayName?: string }
}

/** Subset of butlerd's `Upload` that rakun reads */
export interface ItchUpload {
  id: number
  type?: string
  filename?: string
  displayName?: string
  size?: number
  platforms?: ItchPlatforms
}

export interface ItchUser {
  id: number
  username: string
  displayName?: string
}

export interface ItchInstallInfo {
  game: GameInstallInfo
  manifest: GameManifest
}
