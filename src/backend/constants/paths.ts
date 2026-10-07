import { existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { isAbsolute, join, resolve } from 'path'
import { env } from 'process'
import { dirSync } from 'tmp'

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

let configFolder = appDataPath
// If we're running tests, we want a config folder independent of the normal
// user configuration
if (process.env.CI === 'e2e') {
  const temp_dir = dirSync({ unsafeCleanup: true })
  console.log(
    `CI is set to "e2e", storing Relic config files in ${temp_dir.name}`
  )
  configFolder = temp_dir.name
  mkdirSync(join(configFolder, appName))
}

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
// Deliberately derived from appDataPath and not from configFolder, so the
// `CI=e2e` override above keeps affecting appFolder only, as it did before.
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

export const fakeEpicExePath = join(
  publicDir,
  'bin',
  'x64',
  'win32',
  'EpicGamesLauncher.exe'
)

export const galaxyCommunicationExePath = join(
  publicDir,
  'bin',
  'x64',
  'win32',
  'GalaxyCommunication.exe'
)

export const zoomPlatformScriptPath = join(
  publicDir,
  'bin',
  'zoom',
  'zoom-platform.sh'
)
