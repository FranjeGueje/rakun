/** The platforms butlerd reports for a game or an upload (`windows`, `linux`, `osx`) */
type ItchPlatforms = Partial<Record<'windows' | 'linux' | 'osx', string>>

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

/** What the install modal of a client reads of an itch.io game: its size, which butler gives for its upload */
export interface ItchInstallInfo {
  game: {
    app_name: string
    title: string
    version: string
    buildId: string
    owned_dlc: []
    launch_options: []
    branches: []
  }
  manifest: {
    app_name: string
    disk_size: number
    download_size: number
    languages: string[]
    versionEtag: string
    dependencies: string[]
    perLangSize: Record<string, { download_size: number; disk_size: number }>
  }
}
