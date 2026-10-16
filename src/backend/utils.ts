import { callAllAbortControllers } from './utils/aborthandler/aborthandler'
import { Runner, GameStatus } from 'common/types'
import axios from 'axios'
import https from 'node:https'
import { spawn, SpawnOptions, spawnSync } from 'child_process'
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'fs'

import { logError, logInfo, LogPrefix, logWarning } from 'backend/logger'
import { dirname } from 'path'
import { formatBytes } from 'common/formatBytes'
import { showDialogBoxModalAuto, askQuestion } from './dialog/dialog'
import { sendFrontendMessage } from './ipc'
import { GlobalConfig } from './config'
import { libraryManagerMap, RUNNERS } from 'backend/storeManagers'
import { libraryOf } from 'backend/storeManagers/library_of'
import { markSessionExpired } from 'backend/storeManagers/session_state'
import { backendEvents } from './backend_events'
import { pipeline } from 'stream/promises'
import type { Readable } from 'stream'

import {
  deviceNameCache,
  vendorNameCache
} from './utils/systeminfo/gpu/pci_ids'
import type { AppSettings } from 'common/types'

import { gogdlAuthConfig } from './storeManagers/gog/constants'
import { tokenPath as zoomTokenPath } from './storeManagers/zoom/constants'
import { isOnline } from './online_monitor'
import type { Game } from 'common/types/game_manager'

function getGame(id: string, runner: Runner): Game {
  return libraryManagerMap[runner].getGame(id)
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
 * Stops the daemon. Every helper process rakun started (legendary, gogdl, nile,
 * the installers) has an abort controller while it runs: aborting them stops
 * those and nothing else, unlike killing by name, which also reached a
 * `legendary.exe` running in Wine.
 */
function handleExit() {
  callAllAbortControllers()
  process.exit(0)
}

async function askForceUninstall(game: Game) {
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
    rawError instanceof Error
      ? rawError.message
      : typeof rawError === 'string'
        ? rawError
        : ''
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
    markSessionExpired(runner)
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
  for (const runner of library ? [library] : RUNNERS) {
    libraryOf(runner).clearCache?.()
  }
  deviceNameCache.clear()
  vendorNameCache.clear()
}

export function createNecessaryFolders() {
  // The GOG and Zoom auth folders have to exist before either store can log
  // in: gogdl writes its auth.json with a plain open(path, 'w') and ZoomUser
  // does a bare writeFileSync, neither of which creates the directory. Their
  // stores would create it, but only on a write that happens after login.
  // legendary and nile don't need this, their binaries makedirs on their own.
  const defaultFolders = [dirname(gogdlAuthConfig), dirname(zoomTokenPath)]

  defaultFolders.forEach((folder: string) => {
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

// can be removed if legendary and gogdl handle SIGTERM and SIGKILL
// for us
function killPattern(pattern: string) {
  logInfo(['Trying to kill', pattern], LogPrefix.Backend)
  // pkill reads the pattern as a regex: escape it so "." matches only a dot
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const ret = spawnSync('pkill', ['-f', '--', escaped])
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
      `Downloader: Download Failed with: ${String(err)}`,
      LogPrefix.DownloadManager
    )
    throw new Error(`Download failed with ${String(err)}`)
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
  logInfo('Writing config for Rakun', LogPrefix.Backend)
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

  GlobalConfig.get().set({ ...oldConfig, ...config })
  GlobalConfig.get().flush()
}

export { getLegendaryBin, getGOGdlBin, getNileBin } from './utils/binaries'
export { moveOnUnix, removeFolder, getPathDiskSize } from './utils/disk'

export {
  errorHandler,
  handleExit,
  isEpicServiceOffline,
  removeSpecialcharacters,
  clearCache,
  formatEpicStoreUrl,
  quoteIfNecessary,
  killPattern,
  getFileSize,
  memoryLog,
  sendGameStatusUpdate,
  sendProgressUpdate,
  axiosClient,
  parseSize
}
