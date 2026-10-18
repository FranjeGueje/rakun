import { existsSync, unlinkSync } from 'fs'
import { Game } from 'common/types/game_manager'
import { GameInfo } from 'common/types'
import { basename, join } from 'path'
import { libraryManagerMap } from 'backend/storeManagers'
import { rakunGamesPath } from 'backend/constants/paths'
import { logError, logInfo, logWarning } from 'backend/logger'
import { openExternal } from 'backend/utils/open_external'
import {
  addGameToSteam,
  createRunnerFile,
  createGameSymlink,
  findShortcut,
  findShortcutInAllUsers,
  addShortcut,
  removeShortcut
} from './steam_shortcuts'
import { preparePrefix, removePrefixSymlink } from './prefix'
import type {
  AddGameToSteamResult,
  SteamShortcut
} from './steam_shortcuts/types'
import { downloadGrids, deleteGrids } from './steamgrid'

const LOG_PREFIX = 'Rakun'

function refreshInstallPath(gameInfo: GameInfo): string {
  try {
    const manager = libraryManagerMap[gameInfo.runner] as unknown as {
      getGameInfo?: (
        appName: string,
        forceReload: boolean
      ) => GameInfo | undefined
      refreshInstalled?: () => void
    }
    manager.refreshInstalled?.()
    const freshInfo = manager.getGameInfo?.(gameInfo.app_name, true)
    if (freshInfo) {
      return freshInfo.install.install_path ?? ''
    }
  } catch (e) {
    logError(
      `Failed to refresh game info for ${gameInfo.runner}: ${String(e)}`,
      LOG_PREFIX
    )
  }
  return gameInfo.install.install_path ?? ''
}

/**
 * Adds what `runnerPath` runs to Steam and keeps its shortcut: the rest of the
 * work (`prepare`, the prefix of a Windows game) is done once Steam gave its id.
 */
async function registerInSteam(
  gameInfo: GameInfo,
  resolvedPath: string,
  runnerPath: string,
  prepare?: (steamAppId: number) => Promise<void>
): Promise<AddGameToSteamResult> {
  const appName = gameInfo.app_name
  const result = await addGameToSteam({
    gameName: gameInfo.title,
    runnerPath,
    steamAppId: findShortcut(appName)?.steamAppId
  })

  if (!result.success) {
    logError(
      `Failed to add "${gameInfo.title}" to Steam: ${result.error}`,
      LOG_PREFIX
    )
    return result
  }

  if (result.steamAppId) {
    addShortcut(
      gameInfo.title,
      appName,
      gameInfo.runner,
      result.steamAppId,
      resolvedPath,
      runnerPath
    )
    await prepare?.(result.steamAppId)
    await downloadGrids(gameInfo, result.steamAppId)
    // Not again for a game that was already there
    if (!result.existed)
      void openExternal(`steam://gameproperties/${result.steamAppId}`)
  }

  return result
}

async function installLinuxNative(
  gameInfo: GameInfo,
  resolvedPath: string
): Promise<AddGameToSteamResult> {
  logInfo(`Installing Linux native game: "${gameInfo.title}"`, LOG_PREFIX)

  const symlink = createGameSymlink(resolvedPath)
  if ('error' in symlink) {
    return { success: false, error: symlink.error }
  }

  const runnerPath = join(symlink.linkPath, 'start.sh')
  if (!existsSync(runnerPath)) {
    logWarning(
      `start.sh not found in "${resolvedPath}". Steam may not launch the game correctly.`,
      LOG_PREFIX
    )
  }

  return registerInSteam(gameInfo, resolvedPath, runnerPath)
}

/**
 * Everything a game needs to be in Steam: the runner, the shortcut (added only
 * if it is not there yet), the prefix and the covers. It can be repeated: that
 * is how a repair brings back what an install did not finish.
 */
async function integrateInSteam(
  game: Game,
  installPath?: string
): Promise<AddGameToSteamResult> {
  const gameInfo = game.getGameInfo()
  const appName = gameInfo.app_name

  const resolvedPath =
    installPath ||
    refreshInstallPath(gameInfo) ||
    findShortcut(appName)?.installPath
  if (!resolvedPath) {
    logError(`No install path for "${gameInfo.title}" (${appName})`, LOG_PREFIX)
    return {
      success: false,
      error: `No install path for "${gameInfo.title}" (${appName})`
    }
  }

  if (gameInfo.install?.platform === 'linux') {
    return installLinuxNative(gameInfo, resolvedPath)
  }

  const runnerFile = createRunnerFile(gameInfo, resolvedPath)
  if ('error' in runnerFile) {
    return { success: false, error: runnerFile.error }
  }

  return registerInSteam(gameInfo, resolvedPath, runnerFile.path, (id) =>
    preparePrefix(gameInfo, id, resolvedPath)
  )
}

/** Rakun knows the game; is the shortcut with its id still in Steam? */
function isInSteam(known: SteamShortcut): boolean {
  return findShortcutInAllUsers({ steamAppId: known.steamAppId }).found
}

export async function onGameInstalled(
  game: Game,
  installPath?: string
): Promise<AddGameToSteamResult> {
  const gameInfo = game.getGameInfo()
  const appName = gameInfo.app_name

  const known = findShortcut(appName)
  if (known && isInSteam(known)) {
    logInfo(
      `"${gameInfo.title}" (${appName}) is already tracked in Steam (ID ${known.steamAppId}). Skipping.`,
      LOG_PREFIX
    )
    return { success: true, steamAppId: known.steamAppId }
  }

  return integrateInSteam(game, installPath)
}

/** Repeats the whole integration, even if the game was already added to Steam */
export async function onGameRepaired(game: Game): Promise<void> {
  const { title, app_name: appName } = game.getGameInfo()

  try {
    const result = await integrateInSteam(game)
    logInfo(
      result.success
        ? `Repaired the Steam integration of "${title}" (${appName})`
        : `Could not repair the Steam integration of "${title}" (${appName}): ${result.error}`,
      LOG_PREFIX
    )
  } catch (e) {
    logError(
      `Failed to repair the Steam integration of "${title}": ${String(e)}`,
      LOG_PREFIX
    )
  }
}

/** Points rakun's link of the game at its new folder and keeps the new path */
export function onGameMoved(game: Game, newInstallPath: string): void {
  const gameInfo = game.getGameInfo()
  const appName = gameInfo.app_name

  const known = findShortcut(appName)
  if (!known) {
    logInfo(
      `"${gameInfo.title}" (${appName}) is not tracked in Steam. Skipping move.`,
      LOG_PREFIX
    )
    return
  }

  const oldLink = join(rakunGamesPath, basename(known.installPath))
  const newLink = join(rakunGamesPath, basename(newInstallPath))
  // The same name is replaced by createGameSymlink
  if (oldLink !== newLink) removeLink(oldLink)

  if ('error' in createGameSymlink(newInstallPath)) return

  addShortcut(
    known.gameName,
    known.appId,
    known.store,
    known.steamAppId,
    newInstallPath,
    known.execPath
  )
}

function removeLink(linkPath: string): void {
  try {
    unlinkSync(linkPath)
    logInfo(`Removed old symlink: ${linkPath}`, LOG_PREFIX)
  } catch (e) {
    logError(
      `Failed to remove old symlink ${linkPath}: ${String(e)}`,
      LOG_PREFIX
    )
  }
}

export function onGameUninstalled(game: Game): void {
  const gameInfo = game.getGameInfo()
  const appName = gameInfo.app_name

  const known = findShortcut(appName)

  if (known?.steamAppId) {
    removePrefixSymlink(known.steamAppId)
  }

  // Only the runner's `.bat` is ours: a native game's shortcut points at its own start.sh
  if (known?.execPath?.endsWith('.bat')) {
    try {
      if (existsSync(known.execPath)) {
        unlinkSync(known.execPath)
        logInfo(`Deleted ${known.execPath}`, LOG_PREFIX)
      }
    } catch (e) {
      logError(`Failed to delete ${known.execPath}: ${String(e)}`, LOG_PREFIX)
    }
  }

  if (known?.installPath) {
    const linkPath = join(rakunGamesPath, basename(known.installPath))
    try {
      unlinkSync(linkPath)
      logInfo(`Deleted symlink ${linkPath}`, LOG_PREFIX)
    } catch {
      // Symlink already removed or never existed
    }
  }

  if (known?.steamAppId) {
    deleteGrids(known.steamAppId)
  }

  removeShortcut(appName)
  logInfo(`Removing ${gameInfo.title} from Steam shortcuts`, LOG_PREFIX)
}
