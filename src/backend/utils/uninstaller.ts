import { GlobalConfig } from 'backend/config'
import { logError, logInfo, LogPrefix, logWarning } from 'backend/logger'
import { libraryManagerMap } from 'backend/storeManagers'
import { sendGameStatusUpdate } from 'backend/utils'
import { onGameUninstalled } from 'backend/rakun/game_events'
import { Runner } from 'common/types'
import { existsSync, rmSync } from 'fs'
import { homedir } from 'os'
import { parse, resolve, sep } from 'path'

/**
 * A folder that is not one game's own and must never be removed with it: the
 * root, the home folder, the default install folder or one that holds it.
 * The paths are resolved first, so a trailing `/` or a `..` does not slip by.
 */
export function isSharedFolder(folder: string, defaultInstallPath: string) {
  const target = resolve(folder)
  const installs = resolve(defaultInstallPath)
  return (
    target === parse(target).root ||
    target === resolve(homedir()) ||
    installs === target ||
    installs.startsWith(target + sep)
  )
}

/** What the store did not remove of a game (Legendary and Nile leave what the game wrote in its folder) */
const removeGameFolder = (appName: string, runner: Runner) => {
  const game = libraryManagerMap[runner].getGame(appName)
  const { install } = game.getGameInfo()

  if (!install?.install_path) {
    logInfo('No install path found, skipping removal', LogPrefix.Backend)
    return
  }

  const installPath = install.install_path
  const { defaultInstallPath } = GlobalConfig.get().getSettings()

  if (isSharedFolder(installPath, defaultInstallPath)) {
    logWarning(
      `Not removing ${installPath}: it is not the folder of one game`,
      LogPrefix.Backend
    )
    return
  }

  if (!existsSync(installPath)) return

  logInfo(`Removing install folder ${installPath}`, LogPrefix.Backend)
  rmSync(installPath, { recursive: true })
}

export const uninstallGameCallback = async (
  _e: unknown,
  appName: string,
  runner: Runner,
  shouldRemovePrefix: boolean
) => {
  sendGameStatusUpdate({
    appName,
    runner,
    status: 'uninstalling'
  })

  const game = libraryManagerMap[runner].getGame(appName)

  let uninstalled = false

  try {
    const result = await game.uninstall({ shouldRemovePrefix })
    if (result?.error) logError(result.error, LogPrefix.Backend)
    uninstalled = !result?.error && !result?.abort
    if (uninstalled) onGameUninstalled(game)
  } catch (error) {
    logError(error, LogPrefix.Backend)
  }

  if (uninstalled) {
    if (shouldRemovePrefix) {
      removeGameFolder(appName, runner)
    }

    logInfo('Finished uninstalling', LogPrefix.Backend)
  }

  sendGameStatusUpdate({
    appName,
    runner,
    status: 'done'
  })
}
