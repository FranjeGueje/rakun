import type {
  AppSettings,
  GameInfo,
  GameStatus,
  InstallMode,
  InstallParams,
  InstallPlatform,
  Runner,
  StoreCaps,
  StoreInfo
} from '../api/types'
import type { Ownership } from '../api/bridge'

/**
 * The pictures of a game for a card, best first. `art_square` is the tall box art
 * (3:4: 1200x1600 on Epic), `art_cover` the wide banner (16:9): on a tall card the
 * banner is cropped to its middle and looks zoomed in, so it is only the fallback.
 */
export function coverSources(game: GameInfo): string[] {
  return [...new Set([game.art_square, game.art_cover].filter(Boolean))]
}

/**
 * What leaving the client does to rakun, for the «quit?» dialog. rakunctl would
 * refuse to stop it while it works, so then it stays running; the rakun inside
 * the app stops with it, and the downloads in progress with it.
 */
export function quitMessageKey(
  owns: Ownership,
  busy: boolean
):
  | 'confirm.quit.keep'
  | 'confirm.quit.closeToo'
  | 'confirm.quit.busy'
  | 'confirm.quit.stopsDownloads' {
  if (owns === 'none') return 'confirm.quit.keep'
  if (!busy) return 'confirm.quit.closeToo'
  return owns === 'embedded'
    ? 'confirm.quit.stopsDownloads'
    : 'confirm.quit.busy'
}

export type Filters = {
  store: Runner | 'all'
  installedOnly: boolean
  ascending: boolean
}

/** What the grid lists: DLC is not installable on its own */
export function visibleGames(games: GameInfo[], filters: Filters): GameInfo[] {
  return games
    .filter((game) => !game.install.is_dlc)
    .filter((game) => filters.store === 'all' || game.runner === filters.store)
    .filter((game) => !filters.installedOnly || game.is_installed)
    .sort((a, b) => {
      const order = a.title.localeCompare(b.title)
      return filters.ascending ? order : -order
    })
}

export type StoreTab = { store: StoreInfo; loading: boolean }

/**
 * The store tabs: those with games, and those still being read (so they show
 * from the start). Once a store has arrived with no games, it has no tab.
 */
export function storeTabs(
  games: GameInfo[],
  stores: StoreInfo[],
  libraryLoaded: Partial<Record<Runner, boolean>>
): StoreTab[] {
  const present = new Set(games.map((game) => game.runner))
  return stores
    .filter((store) => present.has(store.id) || !libraryLoaded[store.id])
    .map((store) => ({ store, loading: !libraryLoaded[store.id] }))
}

/** Next or previous option of a ring, e.g. the store tabs */
export function cycle<T>(options: T[], current: T, step: 1 | -1): T {
  if (options.length === 0) return current
  const index = options.indexOf(current)
  return options[(index + step + options.length) % options.length]
}

/** Statuses that are a download going on or waiting */
const DOWNLOADING = new Set(['installing', 'updating', 'extracting'])
const BUSY = new Set([
  ...DOWNLOADING,
  'queued',
  'repairing',
  'uninstalling',
  'moving',
  'importing',
  'launching',
  'playing',
  'syncing-saves',
  'winetricks'
])

export const isBusy = (status?: GameStatus): boolean =>
  !!status && BUSY.has(status.status)

export type GameAction =
  | 'install'
  | 'installWindows'
  | 'installInteractive'
  | 'installSteam'
  | 'installLinux'
  | 'importFolder'
  | 'update'
  | 'repair'
  | 'uninstall'
  | 'cancel'
  | 'removeFromQueue'

/** Which build of a game to install, when the store has more than one */
export type Build = 'windows' | 'linux'

/** A Linux build next to a Windows one: the user chooses (a stale library has no `is_windows_native`: assume it) */
const hasBothBuilds = (game: GameInfo): boolean =>
  !!game.is_linux_native && game.is_windows_native !== false

/** What installs a game that is not installed: the build to choose, and for Zoom's Windows one, where its installer runs */
function installActions(game: GameInfo, caps: StoreCaps): GameAction[] {
  const windows: GameAction[] = caps.installModes
    ? ['installSteam', 'installInteractive']
    : ['installWindows']
  if (hasBothBuilds(game)) return [...windows, 'installLinux']
  if (caps.installModes && !game.is_linux_native) return windows
  return ['install']
}

/** What can be done with a game now. Nothing, while another operation holds it. */
export function actionsFor(
  game: GameInfo,
  status: GameStatus | undefined,
  needsUpdate: boolean,
  caps: StoreCaps
): GameAction[] {
  if (status?.status === 'queued') return ['removeFromQueue']
  if (status && DOWNLOADING.has(status.status)) return ['cancel']
  if (isBusy(status)) return []
  if (!game.is_installed) {
    const install = installActions(game, caps)
    return caps.import ? [...install, 'importFolder'] : install
  }
  const manage: GameAction[] = []
  if (caps.update && needsUpdate) manage.push('update')
  if (caps.repair) manage.push('repair')
  return [...manage, 'uninstall']
}

const windowsFor = (caps: StoreCaps): InstallPlatform =>
  caps.lowercasePlatform ? 'windows' : 'Windows'

/** What a store can do; for one rakun did not report, the usual: manage the game but not import it */
export function capsOf(
  stores: StoreInfo[],
  runner: GameInfo['runner']
): StoreCaps {
  return (
    stores.find((store) => store.id === runner)?.caps ?? {
      import: false,
      update: true,
      repair: true,
      lowercasePlatform: false,
      directLaunch: false,
      installModes: false
    }
  )
}

/** The one asked for; otherwise, as `rakunctl` does, a native Linux game gets its Linux build */
export function platformFor(
  game: GameInfo,
  caps: StoreCaps,
  build?: Build
): InstallPlatform {
  if (build === 'windows') return windowsFor(caps)
  if (build === 'linux' || game.is_linux_native) return 'linux'
  return windowsFor(caps)
}

export function installParams(
  game: GameInfo,
  path: string,
  caps: StoreCaps,
  build?: Build,
  installMode?: InstallMode
): InstallParams {
  return {
    appName: game.app_name,
    runner: game.runner,
    gameInfo: game,
    path,
    platformToInstall: platformFor(game, caps, build),
    ...(installMode ? { installMode } : {})
  }
}

/** Moves a position in a grid by one key, stopping at the edges */
export function moveInGrid(
  index: number,
  key: 'up' | 'down' | 'left' | 'right',
  columns: number,
  count: number
): { index: number; leaves?: 'top' } {
  if (count === 0) return { index: 0 }
  const last = count - 1
  switch (key) {
    case 'left':
      return { index: Math.max(index - 1, 0) }
    case 'right':
      return { index: Math.min(index + 1, last) }
    case 'down':
      return { index: Math.min(index + columns, last) }
    case 'up':
      return index < columns
        ? { index, leaves: 'top' }
        : { index: index - columns }
  }
}

export type MenuEntry =
  | 'accounts'
  | 'helpers'
  | 'downloadPath'
  | 'protonPath'
  | 'steamGridDb'
  | 'language'

/** What the menu shows next to an entry: the setting as it is now (the key is never shown) */
export function menuValue(
  entry: MenuEntry,
  settings: AppSettings,
  t: (
    key: 'menu.automatic' | 'menu.configured' | 'menu.notConfigured'
  ) => string,
  languageName: (code: string) => string
): string {
  if (entry === 'downloadPath') return settings.defaultInstallPath
  if (entry === 'protonPath') return settings.protonPath || t('menu.automatic')
  if (entry === 'steamGridDb')
    return settings.steamGridDbApiKey
      ? t('menu.configured')
      : t('menu.notConfigured')
  if (entry === 'language') return languageName(settings.language)
  return ''
}
