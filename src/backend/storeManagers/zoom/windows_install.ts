import {
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { GlobalConfig } from 'backend/config'
import { rakunMountPath } from 'backend/constants/paths'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import { gameRunnerText } from 'backend/rakun/runner_script'
import { launchUmu, searchUmuGameId } from 'backend/rakun/umu'
import {
  ZOOM_EXE_NAME,
  ZOOM_INF_NAME,
  ZOOM_INSTALLER_DIR
} from 'common/rakun/zoom'
import type { InstallMode } from 'common/types'
import { displayForInstaller } from './display'

/** The runner's `.bat` of the game, told to install and stop; outside `zoom_installer`, which the runner deletes */
const INSTALL_BAT = 'rakun_install.bat'

/** What Inno Setup reads from `/LOADINF`: it hides the pages the user should not change */
const INSTALLER_INF = [
  '[Setup]',
  'Lang=english',
  'Tasks=desktopicon',
  'DisableWelcomePage=yes',
  'DisableDirPage=yes',
  'DisableProgramGroupPage=yes',
  'DisableReadyPage=yes',
  ''
].join('\n')

const driveC = (installPath: string) => join(installPath, 'drive_c')

/** Where a Windows installer waits for the runner: `C:\zoom_installer` inside the game's prefix */
export const zoomInstallerFolder = (installPath: string): string =>
  join(driveC(installPath), ZOOM_INSTALLER_DIR)

/** The mode a client asked for: none means adding the game to Steam, which needs no screen */
export const installModeOr = (mode?: InstallMode): InstallMode =>
  mode ?? 'steam'

export function writeZoomInstallerInf(installerFolder: string): void {
  mkdirSync(installerFolder, { recursive: true })
  writeFileSync(join(installerFolder, ZOOM_INF_NAME), INSTALLER_INF)
}

/** `C:\Launchers` inside the prefix, which is where the runner expects to be */
function linkLauncherMount(installPath: string): void {
  mkdirSync(driveC(installPath), { recursive: true })
  const link = join(driveC(installPath), 'Launchers')
  rmSync(link, { force: true })
  symlinkSync(rakunMountPath, link)
}

/** Writes the `.bat` that installs the game and stops, runs `work` with its Windows path, and removes it */
async function withInstallBat<T>(
  installPath: string,
  appName: string,
  installer: string,
  work: (windowsPath: string) => Promise<T>
): Promise<T> {
  const bat = join(driveC(installPath), INSTALL_BAT)
  const text = gameRunnerText({
    store: 'zoom',
    appName,
    executable: installer,
    installOnly: true
  })
  writeFileSync(bat, text, 'utf-8')
  try {
    return await work(`C:\\${INSTALL_BAT}`)
  } finally {
    unlinkSync(bat)
  }
}

/** Why the installer cannot run now (no screen, no Proton), or `undefined` when it can */
function whyItCannotRun(protonPath: string): string | undefined {
  const display = displayForInstaller()
  if (!display.ok)
    return `${display.reason}. Install the game from Steam instead, or start rakun from a desktop session and try again`
  if (!protonPath)
    return 'No GE-Proton configured. Set it with: rakunctl config protonPath <folder>'
  return undefined
}

/**
 * Runs the installer now, with its window, through the same runner `.bat` that
 * Steam will use. The game is installed when the runner found its executable;
 * if not (the wizard was cancelled or failed) the installer stays for a retry.
 */
export async function installZoomInteractively(
  appName: string,
  installPath: string,
  installer: string
): Promise<{ error?: string }> {
  const protonPath = GlobalConfig.get().getProtonPath()
  const reason = whyItCannotRun(protonPath)
  if (reason) {
    logError(`Not installing: ${reason}`, LogPrefix.Zoom)
    return { error: reason }
  }
  linkLauncherMount(installPath)
  const gameId = (await searchUmuGameId('zoom', appName)) ?? '0'
  logInfo(`Running the installer of ${appName}`, LogPrefix.Zoom)
  await withInstallBat(installPath, appName, installer, (bat) =>
    launchUmu({
      winePrefix: installPath,
      gameId,
      protonPath,
      store: 'zoom',
      executable: 'cmd',
      args: ['/c', bat]
    })
  )
  if (existsSync(join(driveC(installPath), ZOOM_EXE_NAME))) return {}
  return {
    error: 'The installer did not finish: launch the install again to retry'
  }
}
