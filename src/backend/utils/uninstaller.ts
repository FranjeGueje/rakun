import { GlobalConfig } from 'backend/config'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import { libraryManagerMap } from 'backend/storeManagers'
import { sendGameStatusUpdate } from 'backend/utils'
import { Runner } from 'common/types'
import { existsSync, rmSync } from 'fs'

const removePrefix = (appName: string, runner: Runner) => {
  const game = libraryManagerMap[runner].getGame(appName)
  const { install } = game.getGameInfo()

  if (!install?.install_path) {
    logInfo('No install path found, skipping removal', LogPrefix.Backend)
    return
  }

  const installPath = install.install_path
  logInfo(`Removing install folder ${installPath}`, LogPrefix.Backend)

  const { defaultInstallPath } = GlobalConfig.get().getSettings()

  if (installPath === defaultInstallPath) {
    logInfo(
      `Can't delete folder ${installPath}, it is the default install directory ${defaultInstallPath}`
    )
    return
  }

  if (!existsSync(installPath)) {
    logInfo(`Install folder ${installPath} doesn't exist, ignoring removal`)
    return
  }

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
    await game.uninstall({ shouldRemovePrefix })
    uninstalled = true
  } catch (error) {
    logError(error, LogPrefix.Backend)
  }

  if (uninstalled) {
    if (shouldRemovePrefix) {
      removePrefix(appName, runner)
    }

    logInfo('Finished uninstalling', LogPrefix.Backend)
  }

  sendGameStatusUpdate({
    appName,
    runner,
    status: 'done'
  })
}
