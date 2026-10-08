import { existsSync } from 'fs'
import { homedir } from 'os'
import { isAbsolute, join, resolve } from 'path'
import { env } from 'process'

// rakun is a fork of Relic and must not share any data with it
const appName = 'rakun'

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
export const rakunIconFolder = join(appFolder, 'icons')
export const rakunInstallPath = join(userHome, 'Games', 'Rakun')
export const fixesPath = join(appFolder, 'fixes')
export const rakunRunnerPath = join(
  userHome,
  '.local',
  'share',
  appName,
  'runner'
)
export const rakunMountPath = join(
  userHome,
  '.local',
  'share',
  appName,
  'mount'
)
/** The helper binaries that are downloaded (`rakunctl helpers update`): they stay when the app is updated */
export const rakunBinPath = join(userHome, '.local', 'share', appName, 'bin')
export const rakunGamesPath = join(
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

// A release keeps `public` next to the bundle (rakun/rakun.cjs and
// rakun/public); a source checkout runs build/rakun.cjs with `public` one
// level up.
const bundledPublicDir = join(__dirname, 'public')
export const publicDir = existsSync(bundledPublicDir)
  ? bundledPublicDir
  : resolve(__dirname, '..', 'public')
