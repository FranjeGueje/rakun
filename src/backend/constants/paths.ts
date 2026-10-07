import { existsSync } from 'fs'
import { homedir } from 'os'
import { isAbsolute, join, resolve } from 'path'
import { env } from 'process'

// relicd is a fork of Relic and must not share any data with it
const appName = 'relicd'

// Mirrors Electron's `app.getPath('appData')` on Linux: XDG_CONFIG_HOME when it
// holds an absolute path (relative values are ignored per the XDG spec),
// otherwise ~/.config.
const xdgConfigHome = env.XDG_CONFIG_HOME
export const appDataPath =
  xdgConfigHome && isAbsolute(xdgConfigHome)
    ? xdgConfigHome
    : join(homedir(), '.config')

const configFolder = appDataPath

// XDG Base Directory: cache = regenerable, non-essential data.
// XDG_CACHE_HOME when it holds an absolute path (relative values are ignored
// per the XDG spec), otherwise ~/.cache.
const xdgCacheHome = env.XDG_CACHE_HOME
const cachePath = join(
  xdgCacheHome && isAbsolute(xdgCacheHome)
    ? xdgCacheHome
    : join(homedir(), '.cache'),
  appName
)
export const storeCachePath = join(cachePath, 'store_cache')
export const imagesCachePath = join(cachePath, 'images-cache')

export const userHome = homedir()

export const appFolder = join(configFolder, appName)
// Mirrors Electron's `app.getPath('userData')`: appData + app.getName().
export const userDataPath = join(appDataPath, appName)
export const toolsPath = join(appFolder, 'tools')
export const configPath = join(appFolder, 'config.json')
export const relicIconFolder = join(appFolder, 'icons')
export const relicInstallPath = join(userHome, 'Games', 'Relicd')
export const fixesPath = join(appFolder, 'fixes')
export const relicRunnerPath = join(
  userHome,
  '.local',
  'share',
  appName,
  'runner'
)
export const relicMountPath = join(
  userHome,
  '.local',
  'share',
  appName,
  'mount'
)
export const relicGamesPath = join(
  userHome,
  '.local',
  'share',
  appName,
  'games'
)
export const steamCompatDir = join(
  userHome,
  '.local',
  'share',
  'Steam',
  'compatibilitytools.d'
)

// A release keeps `public` next to the bundle (relicd/relicd.cjs and
// relicd/public); a source checkout runs build/relicd.cjs with `public` one
// level up.
const bundledPublicDir = join(__dirname, 'public')
export const publicDir = existsSync(bundledPublicDir)
  ? bundledPublicDir
  : resolve(__dirname, '..', 'public')

export const zoomPlatformScriptPath = join(
  publicDir,
  'bin',
  'zoom',
  'zoom-platform.sh'
)
