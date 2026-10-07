import { callAllAbortControllers } from './utils/aborthandler/aborthandler'
import { Runner, GameInfo, GameStatus } from 'common/types'
import axios from 'axios'
import https from 'node:https'
import { exec, spawn, SpawnOptions, spawnSync } from 'child_process'
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'fs'
import { promisify } from 'util'

import { logError, logInfo, LogPrefix, logWarning } from 'backend/logger'
import { basename, dirname, join } from 'path'
import {
  gameInfoStore,
  installStore,
  libraryStore
} from 'backend/storeManagers/legendary/electronStores'
import {
  apiInfoCache as GOGapiInfoCache,
  installInfoStore as GOGinstallInfoStore,
  libraryStore as GOGlibraryStore
} from './storeManagers/gog/electronStores'
import {
  installStore as nileInstallStore,
  libraryStore as nileLibraryStore
} from './storeManagers/nile/electronStores'
import {
  installInfoStore as zoomInstallInfoStore,
  libraryStore as zoomLibraryStore
} from './storeManagers/zoom/electronStores'
import { formatBytes } from 'common/formatBytes'
import { showDialogBoxModalAuto, askQuestion } from './dialog/dialog'
import { sendFrontendMessage } from './ipc'
import { GlobalConfig } from './config'
import { libraryManagerMap } from 'backend/storeManagers'
import { readdir, lstat } from 'fs/promises'
import { backendEvents } from './backend_events'
import { pipeline } from 'stream/promises'
import type { Readable } from 'stream'

import {
  deviceNameCache,
  vendorNameCache
} from './utils/systeminfo/gpu/pci_ids'
import type { AppSettings } from 'common/types'
import { configStore } from './constants/key_value_stores'
import { relicIconFolder, publicDir, toolsPath } from './constants/paths'

import { gogdlAuthConfig } from './storeManagers/gog/constants'
import { tokenPath as zoomTokenPath } from './storeManagers/zoom/constants'
import { isRunning } from './downloadmanager/downloadqueue'
import { isOnline } from './online_monitor'
import type { Game } from 'common/types/game_manager'

const execAsync = promisify(exec)

function getGame(id: string, runner: Runner): Game {
  return libraryManagerMap[runner].getGame(id)
}

/**
 * Compares 2 SemVer strings following "major.minor.patch".
 * Checks if target is newer than base.
 */
function semverGt(target: string, base: string) {
  if (!target || !base) {
    return false
  }
  target = target.replace('v', '')

  // beta to beta
  if (base.includes('-beta') && target.includes('-beta')) {
    const bSplit = base.split('-beta.')
    const tSplit = target.split('-beta.')

    // same major beta?
    if (bSplit[0] === tSplit[0]) {
      base = bSplit[1]
      target = tSplit[1]
      return target > base
    } else {
      base = bSplit[0]
      target = tSplit[0]
    }
  }

  // beta to stable
  if (base.includes('-beta')) {
    base = base.split('-beta.')[0]
  }

  // stable to beta
  if (target.includes('-beta')) {
    target = target.split('-beta.')[0]
  }

  const [bmajor, bminor, bpatch] = base.split('.').map(Number)
  const [tmajor, tminor, tpatch] = target.split('.').map(Number)

  let isGE = false
  // A pretty nice piece of logic if you ask me. :P
  isGE ||= tmajor > bmajor
  isGE ||= tmajor === bmajor && tminor > bminor
  isGE ||= tmajor === bmajor && tminor === bminor && tpatch > bpatch
  return isGE
}

const getFileSize = formatBytes

async function isEpicServiceOffline(
  type: 'Epic Games Store' | 'Fortnite' | 'Rocket League' = 'Epic Games Store'
) {
  if (!isOnline()) return true

  const epicStatusApi = 'https://status.epicgames.com/api/v2/components.json'
  try {
    const { data } = await axiosClient.get(epicStatusApi)

    for (const component of data.components) {
      const { name: name, status: indicator } = component

      // found component and checking status
      if (name === type) {
        return indicator === 'major'
      }
    }

    // Epic's status page did not list the component at all, so there is nothing
    // to report. This used to notify the user that the store was offline while
    // returning "not offline" at the same time.
    logWarning(
      `Epic status API did not list "${type}", assuming it is online`,
      LogPrefix.Backend
    )
    return false
  } catch (error) {
    logError(
      ['Failed to get epic service status with', error],
      LogPrefix.Backend
    )
    return false
  }
}

/**
 * Stops the daemon. If there are pending operations, the child processes that
 * run them (legendary, gogdl, nile) are killed first.
 */
function handleExit() {
  if (isRunning()) {
    // This is very hacky and can be removed if bineries handle SIGTERM and SIGKILL
    // FIXME: we should keep track of what we are doing and kill just that
    // this is really dangerous cause we can be killing other processes unrelated
    // to what we are doing x_x
    const possibleChildren = ['legendary', 'gogdl', 'nile']
    possibleChildren.forEach((procName) => {
      try {
        killPattern(procName)
      } catch (error) {
        logInfo([`Unable to kill ${procName}, ignoring.`, error])
      }
    })

    // Kill all child processes
    callAllAbortControllers()
  }

  process.exit(0)
}

export async function askForceUninstall(game: Game) {
  const { title } = game.getGameInfo()
  const response = await askQuestion({
    title,
    message:
      'Game folder appears to be deleted, do you want to remove the game from the installed list?',
    buttons: ['No', 'Yes']
  })

  if (response === 1) {
    await game.forceUninstall()
  }
  return response
}

async function errorHandler(
  rawError: unknown,
  appName: string,
  runner: Runner
): Promise<void> {
  // Callers may pass an Error object (e.g. a failed spawn), not only output text
  const error =
    rawError instanceof Error ? rawError.message : String(rawError ?? '')
  const plat = runner === 'legendary' ? 'Legendary (Epic Games)' : runner
  const deletedFolderMsg = 'appears to be deleted'
  const expiredCredentials = 'No saved credentials'
  const legendaryRegex = /legendary.*\.py/
  const ignoreMessages = [
    // this message appears on macOS when no Crossover was found in the system, but it's a false alarm
    'IndexError: list index out of range',
    // Happens with the Zipapp build of Legendary on Linux, if the user updates
    // dependencies requests relies on
    'RequestsDependencyWarning'
  ]

  if (!error) return

  if (ignoreMessages.some((msg) => error.includes(msg))) return

  if (error.includes(deletedFolderMsg) && appName) {
    await askForceUninstall(getGame(appName, runner))
    return
  }

  if (legendaryRegex.test(error)) {
    const MemoryError = 'MemoryError: '
    if (error.includes(MemoryError)) {
      return
    }

    return showDialogBoxModalAuto({
      title: plat,
      message: `An error has occurred! Try to Logout and Login on your Epic account. \n  ${error}`,
      type: 'ERROR'
    })
  }

  if (error.includes(expiredCredentials)) {
    return showDialogBoxModalAuto({
      title: plat,
      message: 'Your Crendentials have expired, Logout and Login Again!',
      type: 'ERROR'
    })
  }
}

// If you ever modify this range of characters, please also add them to nile
// source as this function is used to determine how game directory will be named
function removeSpecialcharacters(text: string): string {
  const regexp = new RegExp(/[:|/|*|?|<|>|\\|&|{|}|%|$|@|`|!|™|+|'|"|®]/, 'gi')
  return text.replaceAll(regexp, '')
}

function clearCache(library?: Runner) {
  if (library === 'gog' || !library) {
    GOGlibraryStore.clear()
    GOGinstallInfoStore.clear()
  }
  if (library === 'legendary' || !library) {
    installStore.clear()
    libraryStore.clear()
    gameInfoStore.clear()
    void libraryManagerMap['legendary'].runRunnerCommand(
      { subcommand: 'cleanup' },
      { abortId: 'legandary-cleanup' }
    )
  }
  if (library === 'nile' || !library) {
    nileInstallStore.clear()
    nileLibraryStore.clear()
  }
  if (library === 'zoom' || !library) {
    zoomInstallInfoStore.clear()
    zoomLibraryStore.clear()
  }

  if (library === 'gog' || !library) GOGapiInfoCache.clear()
  deviceNameCache.clear()
  vendorNameCache.clear()
}

function splitPathAndName(fullPath: string): { dir: string; bin: string } {
  const dir = dirname(fullPath)
  const bin = basename(fullPath)
  // Make sure to always return this as `dir, bin` to not break path
  // resolution when using `join(...Object.values(...))`
  return { dir, bin }
}

function archSpecificBinary(binaryName: string) {
  // Try to use the arch-native binary first, if that doesn't exist fall back to
  // the x64 version (assume a compatibility layer like box64 is installed)
  const archSpecificPath = join(
    publicDir,
    'bin',
    process.arch,
    process.platform,
    binaryName
  )
  if (existsSync(archSpecificPath)) return archSpecificPath
  return join(publicDir, 'bin', 'x64', process.platform, binaryName)
}

let defaultLegendaryPath: string | undefined = undefined
function getLegendaryBin(): { dir: string; bin: string } {
  const settings = GlobalConfig.get().getSettings()
  if (settings?.altLegendaryBin) {
    return splitPathAndName(settings.altLegendaryBin)
  }

  if (!defaultLegendaryPath)
    defaultLegendaryPath = archSpecificBinary('legendary')

  return splitPathAndName(defaultLegendaryPath)
}

let defaultGogdlPath: string | undefined = undefined
function getGOGdlBin(): { dir: string; bin: string } {
  const settings = GlobalConfig.get().getSettings()
  if (settings?.altGogdlBin) {
    return splitPathAndName(settings.altGogdlBin)
  }

  if (!defaultGogdlPath) defaultGogdlPath = archSpecificBinary('gogdl')

  return splitPathAndName(defaultGogdlPath)
}

let defaultNilePath: string | undefined = undefined
function getNileBin(): { dir: string; bin: string } {
  const settings = GlobalConfig.get().getSettings()
  if (settings?.altNileBin) {
    return splitPathAndName(settings.altNileBin)
  }

  if (!defaultNilePath) defaultNilePath = archSpecificBinary('nile')

  return splitPathAndName(defaultNilePath)
}

export function createNecessaryFolders() {
  // The GOG and Zoom auth folders have to exist before either store can log
  // in: gogdl writes its auth.json with a plain open(path, 'w') and ZoomUser
  // does a bare writeFileSync, neither of which creates the directory. Their
  // stores would create it, but only on a write that happens after login.
  // legendary and nile don't need this, their binaries makedirs on their own.
  const defaultFolders = [
    relicIconFolder,
    dirname(gogdlAuthConfig),
    dirname(zoomTokenPath)
  ]

  ;[...defaultFolders, toolsPath].forEach((folder: string) => {
    if (!existsSync(folder)) {
      mkdirSync(folder, { recursive: true })
    }
  })
}

const specialCharactersRegex =
  /('\w)|(\\(\w|\d){5})|(\\"(\\.|[^"])*")|[^((0-9)|(a-z)|(A-Z)|\s)]/g // addeed regex for capturings "'s" + unicodes + remove subtitles in quotes
const cleanTitle = (title: string) =>
  title
    .replaceAll(specialCharactersRegex, '')
    .replaceAll(' ', '-')
    .replaceAll('®', '')
    .toLowerCase()
    .split('--definitive')[0]

const formatEpicStoreUrl = (title: string) => {
  const storeUrl = `https://www.epicgames.com/store/product/`
  return `${storeUrl}${cleanTitle(title)}`
}

function quoteIfNecessary(stringToQuote: string) {
  const shouldQuote =
    typeof stringToQuote === 'string' &&
    !(stringToQuote.startsWith('"') && stringToQuote.endsWith('"')) &&
    stringToQuote.includes(' ')

  if (shouldQuote) {
    return `"${stringToQuote}"`
  }

  return String(stringToQuote)
}

function removeQuoteIfNecessary(stringToUnquote: string) {
  if (
    stringToUnquote &&
    stringToUnquote.startsWith('"') &&
    stringToUnquote.endsWith('"')
  ) {
    return stringToUnquote.replace(/^"+/, '').replace(/"+$/, '')
  }

  return String(stringToUnquote)
}

// can be removed if legendary and gogdl handle SIGTERM and SIGKILL
// for us
function killPattern(pattern: string) {
  logInfo(['Trying to kill', pattern], LogPrefix.Backend)
  const ret = spawnSync('pkill', ['-f', pattern])
  logInfo(['Killed', pattern], LogPrefix.Backend)
  return ret
}

export const spawnAsync = async (
  command: string,
  args: string[],
  options: SpawnOptions = {},
  onOutput?: (data: string) => void
): Promise<{ code: number | null; stdout: string; stderr: string }> => {
  const child = spawn(command, args, options)
  const stdout = memoryLog()
  const stderr = memoryLog()

  if (child.stdout) {
    child.stdout.on('data', (data) => {
      if (onOutput) {
        onOutput(data.toString())
      }
      stdout.push(data.toString())
    })
  }

  if (child.stderr) {
    child.stderr.on('data', (data) => {
      if (onOutput) {
        onOutput(data.toString())
      }
      stderr.push(data.toString())
    })
  }

  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({
        code,
        stdout: stdout.join(''),
        stderr: stderr.join('')
      })
    })
  })
}

export async function moveOnUnix(
  newInstallPath: string,
  gameInfo: GameInfo
): Promise<
  { status: 'done'; installPath: string } | { status: 'error'; error: string }
> {
  const {
    install: { install_path },
    title
  } = gameInfo
  if (!install_path) {
    return { status: 'error', error: 'No install path found' }
  }

  const destination = join(newInstallPath, basename(install_path))

  let currentFile = ''

  let rsyncExists = false
  try {
    await execAsync('which rsync')
    rsyncExists = true
  } catch (error) {
    logError(error, LogPrefix.Gog)
  }
  if (rsyncExists) {
    const origin = install_path + '/'
    logInfo(
      `moving command: rsync --archive --compress --no-human-readable --remove-source-files --info=name,progress ${origin} ${destination} `,
      LogPrefix.Backend
    )
    const { code, stderr } = await spawnAsync(
      'rsync',
      [
        '--archive',
        '--compress',
        '--no-human-readable',
        '--remove-source-files',
        '--info=name,progress',
        origin,
        destination
      ],
      { stdio: 'pipe' },
      (data) => {
        let percent = 0
        let eta = ''
        let bytes = '0'

        // Multiple output lines might be buffered into a single `data`, so
        // we have to iterate over every line (we can't just look at the last
        // one since that might skip new files)
        for (const outLine of data.trim().split('\n')) {
          // Rsync outputs either the file currently being transferred or a
          // progress report. To know which one of those `outLine` is, we check
          // if it includes a %, :, and starts with a space
          // If all of these aren't the case, it's *most likely* a filename
          // FIXME: This is pretty hacky, but I don't see an obvious way to
          //        "divide" the two output types other than that
          const isFilenameOutput =
            !outLine.includes('%') &&
            !outLine.includes(':') &&
            !outLine.startsWith(' ')

          if (isFilenameOutput) {
            // If we have a filename output, set `lastFile` and reset all
            // other metrics. Either there'll be a progress update in the next
            // line of `data`, or we've just started copying and thus start at 0
            currentFile = outLine
            percent = 0
            eta = ''
            bytes = '0'
          } else {
            // If we got the progress update, try to read out the bytes, ETA and
            // percent
            const bytesMatch = outLine.match(/^\s+(\d+)/)?.[1]
            const etaMatch = outLine.match(/(\d+:\d{2}:\d{2})/)?.[1]
            const percentMatch = outLine.match(/(\d+)%/)?.[1]
            if (bytesMatch) bytes = getFileSize(Number(bytesMatch))
            if (etaMatch) eta = etaMatch
            if (percentMatch) percent = Number(percentMatch)
          }
        }

        sendFrontendMessage('progressUpdate', {
          appName: gameInfo.app_name,
          runner: gameInfo.runner,
          status: 'moving',
          progress: {
            percent,
            eta,
            bytes,
            file: currentFile
          }
        })
      }
    )
    if (code !== 1) {
      logInfo(`Finished Moving ${title}`, LogPrefix.Backend)
      // remove the old install path
      await spawnAsync('rm', ['-rf', install_path])
    } else {
      logError(`Error: ${stderr}`, LogPrefix.Backend)
      return { status: 'error', error: stderr }
    }
  } else {
    const { code, stderr } = await spawnAsync('mv', [
      '-f',
      install_path,
      destination
    ])
    if (code !== 1) {
      return { status: 'done', installPath: destination }
    } else {
      logError(`Error: ${stderr}`, LogPrefix.Backend)
      return { status: 'error', error: stderr }
    }
  }
  return { status: 'done', installPath: destination }
}

// helper object for an array with a length limit
// this is used when calling system processes to not store the complete output in memory
//
// the `limit` is the number of messages, it doesn't mean it will be exactly `limit` lines since a message can be multi-line
const memoryLog = (limit = 50) => {
  const lines: string[] = []

  return {
    push: (newLine: string) => {
      lines.unshift(newLine)
      if (lines.length > limit) {
        lines.length = limit
      }
    },
    join: (separator = '') => {
      return lines.toReversed().join(separator)
    }
  }
}

function removeFolder(path: string, folderName: string) {
  if (path === 'default') {
    const { defaultInstallPath } = GlobalConfig.get().getSettings()
    const path = defaultInstallPath.replaceAll("'", '')
    const folderToDelete = `${path}/${folderName}`
    if (existsSync(folderToDelete)) {
      return setTimeout(() => {
        rmSync(folderToDelete, { recursive: true })
      }, 5000)
    }
    return
  }

  const folderToDelete = `${path}/${folderName}`.replaceAll("'", '')
  if (existsSync(folderToDelete)) {
    return setTimeout(() => {
      rmSync(folderToDelete, { recursive: true })
    }, 2000)
  }
  return
}

async function getPathDiskSize(path: string): Promise<number> {
  const statData = await lstat(path)
  let size = 0
  if (statData.isSymbolicLink()) {
    return 0
  }
  if (statData.isDirectory()) {
    const contents = await readdir(path)

    for (const item of contents) {
      const itemPath = join(path, item)
      size += await getPathDiskSize(itemPath)
    }
    return size
  }

  return statData.size
}

function sendGameStatusUpdate(payload: GameStatus) {
  sendFrontendMessage('gameStatusUpdate', payload)
  backendEvents.emit('gameStatusUpdate', payload)
}

function sendProgressUpdate(payload: GameStatus) {
  sendFrontendMessage('progressUpdate', payload)
  backendEvents.emit(`progressUpdate-${payload.appName}`, payload)
}

/**
 * Downloads a file to `dest`, replacing it. A partial file is removed when the
 * download fails.
 * @throws {Error} - If the download fails.
 */
export async function downloadFile({
  url,
  dest
}: {
  url: string
  dest: string
}): Promise<void> {
  try {
    const { data } = await axiosClient.get<Readable>(url, {
      responseType: 'stream',
      timeout: 0
    })
    await pipeline(data, createWriteStream(dest))
    logInfo(
      `Downloader: Finished downloading ${url}`,
      LogPrefix.DownloadManager
    )
  } catch (err) {
    rmSync(dest, { force: true })
    logError(
      `Downloader: Download Failed with: ${err}`,
      LogPrefix.DownloadManager
    )
    throw new Error(`Download failed with ${err}`)
  }
}

function parseSize(size: string): number {
  const units = ['bytes', 'kb', 'mb', 'gb', 'tb', 'pb']
  let unit_index = 0
  size = size.trim().toLowerCase()
  for (const unit of units) {
    if (size.endsWith(unit)) {
      size = size.slice(0, -unit.length).trim()
      break
    }
    unit_index += 1
  }
  try {
    return Math.round(parseFloat(size) * 1024 ** unit_index)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    logWarning(`Invalid size value '${size}'`, LogPrefix.Backend)
    return 0
  }
}

const axiosClient = axios.create({
  timeout: 10 * 1000,
  httpsAgent: new https.Agent({ keepAlive: true })
})

export const writeConfig = (config: Partial<AppSettings>) => {
  logInfo('Writing config for Relic', LogPrefix.Backend)
  const oldConfig = GlobalConfig.get().getSettings()

  // log only the changed setting
  const changedKeys = (Object.keys(config) as (keyof AppSettings)[]).filter(
    (key) =>
      key in oldConfig &&
      JSON.stringify(oldConfig[key]) !== JSON.stringify(config[key])
  )
  for (const key of changedKeys) {
    backendEvents.emit('settingChanged', {
      key,
      oldValue: oldConfig[key],
      newValue: config[key]
    })
  }

  GlobalConfig.get().set(config as AppSettings)
  GlobalConfig.get().flush()
  const currentConfigStore = configStore.get_nodefault('settings')
  if (currentConfigStore) {
    configStore.set('settings', { ...currentConfigStore, ...config })
  }
}

export {
  errorHandler,
  execAsync,
  handleExit,
  isEpicServiceOffline,
  removeSpecialcharacters,
  clearCache,
  getLegendaryBin,
  getGOGdlBin,
  getNileBin,
  formatEpicStoreUrl,
  quoteIfNecessary,
  removeQuoteIfNecessary,
  killPattern,
  getFileSize,
  memoryLog,
  removeFolder,
  getPathDiskSize,
  sendGameStatusUpdate,
  sendProgressUpdate,
  axiosClient,
  parseSize
}

// Exported only for testing purpose
// ts-prune-ignore-next
export const testingExportsUtils = {
  semverGt
}
