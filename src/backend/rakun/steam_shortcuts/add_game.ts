import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { basename, dirname, join } from 'path'
import { logError, logInfo } from 'backend/logger'
import { spawnAsync } from 'backend/utils'
import {
  rakunRunnerPath,
  rakunGamesPath,
  userDataPath
} from 'backend/constants/paths'
import {
  findShortcutInAllUsers,
  getShortcutId,
  checkSteamProtocolHandler
} from './steam_helpers'
import type {
  AddGameToSteamOptions,
  AddGameToSteamResult,
  GameRunner
} from './types'
import { GameInfo } from 'common/types'
import { gameRunnerText } from '../runner_script'

const LOG_PREFIX = 'Rakun'

export function createRunnerFile(
  gameInfo: GameInfo,
  installPath: string
): { path: string } | { error: string } {
  if (gameInfo.runner === 'zoom') {
    const executable = gameInfo.install.executable
    if (!executable) {
      return { error: 'No executable found for Zoom game' }
    }

    const symlink = createGameSymlink(installPath)
    if ('error' in symlink) {
      return { error: symlink.error }
    }

    return { path: join(symlink.linkPath, executable) }
  }

  try {
    const runnerPath = createRakunBat(
      installPath,
      gameInfo.title,
      gameInfo.runner,
      gameInfo.app_name
    )
    return { path: runnerPath }
  } catch (e) {
    logError(`Failed to create runner file: ${String(e)}`, LOG_PREFIX)
    return { error: `Failed to create runner file: ${String(e)}` }
  }
}

function getGogUsername(): string {
  try {
    const configPath = join(userDataPath, 'gog_store', 'config.json')
    const raw = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw)
    return config.userData?.username ?? ''
  } catch {
    return ''
  }
}

/** The `.bat` the Steam shortcut of a game runs: its variables and a call to the runner of the mount */
export function createRakunBat(
  installPath: string,
  gameName: string,
  runner: GameRunner,
  appName: string
): string {
  const runnerPath = join(rakunRunnerPath, `${gameName}.bat`)

  mkdirSync(rakunRunnerPath, { recursive: true })

  const content = gameRunnerText({
    store: runner,
    appName,
    folder: basename(installPath),
    username: runner === 'gog' ? getGogUsername() : undefined
  })
  writeFileSync(runnerPath, content, 'utf-8')

  logInfo(`Created ${runnerPath}`, LOG_PREFIX)
  return runnerPath
}

export function createGameSymlink(
  installPath: string
): { linkPath: string } | { error: string } {
  if (!installPath) {
    return { error: 'No install path provided' }
  }
  const linkPath = join(rakunGamesPath, basename(installPath))
  try {
    if (existsSync(linkPath)) {
      unlinkSync(linkPath)
    }
    mkdirSync(rakunGamesPath, { recursive: true })
    symlinkSync(installPath, linkPath)
    logInfo(`Created symlink: ${linkPath} -> ${installPath}`, LOG_PREFIX)
    return { linkPath }
  } catch (error) {
    logError(
      `Failed to create symlink ${linkPath}: ${String(error)}`,
      LOG_PREFIX
    )
    return { error: `Failed to create symlink: ${String(error)}` }
  }
}

const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 15000
const ADD_GAME_MARKER = '/tmp/addnonsteamgamefile'

function escapeDesktopName(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

function quoteDesktopExec(value: string): string {
  return `"${value.replace(/[\\"$`]/g, '\\$&')}"`
}

// Steam only reads Name/Exec from the .desktop when the Exec target is
// executable; otherwise it registers the .desktop itself as the shortcut.
function makeExecutable(runnerPath: string): void {
  try {
    chmodSync(runnerPath, 0o755)
  } catch (error) {
    logError(`Failed to chmod ${runnerPath}: ${String(error)}`, LOG_PREFIX)
  }
}

// Steam takes the shortcut title from `Name` and the executable from `Exec`
// of a .desktop file, so the title no longer depends on the runner's filename.
function writeSteamLauncher(gameName: string, runnerPath: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rakun-steam-'))
  const desktopPath = join(dir, 'launcher.desktop')
  const content = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${escapeDesktopName(gameName)}`,
    `Exec=${quoteDesktopExec(runnerPath)}`,
    `Path=${dirname(runnerPath)}`,
    'Terminal=false',
    ''
  ].join('\n')
  writeFileSync(desktopPath, content, 'utf-8')
  return desktopPath
}

export async function addGameToSteam(
  options: AddGameToSteamOptions
): Promise<AddGameToSteamResult> {
  const { gameName, runnerPath, steamAppId: knownId } = options

  checkSteamProtocolHandler()

  const existing = findShortcutInAllUsers({
    steamAppId: knownId,
    exe: runnerPath
  })
  if (existing.error) return { success: false, error: existing.error }
  if (existing.entry) {
    const steamAppId = getShortcutId(existing.entry)
    logInfo(
      `"${gameName}" already exists in Steam (ID ${steamAppId}). Skipping.`,
      LOG_PREFIX
    )
    return { success: true, steamAppId, existed: true }
  }

  writeFileSync(ADD_GAME_MARKER, '', 'utf-8')

  makeExecutable(runnerPath)
  const desktopPath = writeSteamLauncher(gameName, runnerPath)
  try {
    return await sendToSteam(gameName, runnerPath, desktopPath)
  } finally {
    rmSync(dirname(desktopPath), { recursive: true, force: true })
  }
}

async function sendToSteam(
  gameName: string,
  runnerPath: string,
  desktopPath: string
): Promise<AddGameToSteamResult> {
  const steamUrl = `steam://addnonsteamgame/${encodeURIComponent(desktopPath)}`

  try {
    await spawnAsync('xdg-open', [steamUrl])
    logInfo(`Opened ${steamUrl}`, LOG_PREFIX)
  } catch (error) {
    logError(`Failed to open steam:// URL: ${String(error)}`, LOG_PREFIX)
    return {
      success: false,
      error: `Failed to open steam:// URL: ${String(error)}`
    }
  }

  logInfo(`Waiting for "${gameName}" to be added to Steam...`, LOG_PREFIX)

  const steamAppId = await waitForShortcut(gameName, runnerPath)

  if (!steamAppId) {
    return {
      success: false,
      error:
        `"${gameName}" was not added to Steam in time. ` +
        `Make sure Steam is running; if it adds it later, repair the game to link it.`
    }
  }

  logInfo(`"${gameName}" added to Steam with app ID ${steamAppId}.`, LOG_PREFIX)

  return { success: true, steamAppId }
}

/**
 * The id of the shortcut that runs `runnerPath`, or 0 on timeout. No shortcut
 * ran it before (`addGameToSteam` checked), so the one that appears is the new one.
 */
async function waitForShortcut(
  gameName: string,
  runnerPath: string
): Promise<number> {
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    const { entry } = findShortcutInAllUsers({ exe: runnerPath })
    const steamAppId = entry ? getShortcutId(entry) : 0
    if (steamAppId) return steamAppId
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  logError(
    `Timeout waiting for "${gameName}" to appear in Steam shortcuts (${POLL_TIMEOUT_MS}ms).`,
    LOG_PREFIX
  )
  return 0
}
