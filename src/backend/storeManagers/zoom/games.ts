import {
  installModeOr,
  installZoomInteractively,
  writeZoomInstallerInf,
  zoomInstallerFolder
} from './windows_install'
import {
  getFileSize,
  parseSize,
  spawnAsync,
  sendProgressUpdate,
  moveOnUnix
} from '../../utils'
import { join } from 'node:path'
import * as fs from 'fs'
import type { SpawnOptions } from 'child_process'
import axios, { AxiosProgressEvent } from 'axios'
import { saveStreamToFile } from './download'
import {
  ExtraInfo,
  GameInfo,
  ExecResult,
  InstallArgs,
  InstalledInfo,
  InstallMode,
  InstallProgress
} from 'common/types'
import { installedGamesStore, libraryStore } from './stores'
import {
  logError,
  logInfo,
  LogPrefix,
  logWarning,
  logDebug
} from 'backend/logger'

import { ZoomInstallPlatform, ZoomDownloadFile } from 'common/types/zoom'
import { showDialogBoxModalAuto } from '../../dialog/dialog'
import { sendFrontendMessage } from '../../ipc'
import { Game, InstallResult } from 'common/types/game_manager'
import { removeInstalled, upsertInstalled } from '../installed_list'
import { libraryManagerMap } from '..'

import { createAbortController } from 'backend/utils/aborthandler/aborthandler'

export default class ZoomGame implements Game {
  private readonly id: string

  constructor(id: string) {
    this.id = id
  }

  async getExtraInfo(): Promise<ExtraInfo> {
    // Zoom.py doesn't have direct equivalents for reqs, changelog, etc.
    // This part would need to be implemented if the Zoom API provides such data.
    const extra: ExtraInfo = {
      about: { description: '', shortDescription: '' },
      reqs: [],
      releaseDate: undefined,
      storeUrl: undefined,
      changelog: undefined
    }
    return extra
  }

  getGameInfo(): GameInfo {
    const info = libraryManagerMap['zoom'].getGameInfo(this.id)
    if (!info) {
      logError(
        [
          'Could not get game info for',
          `${this.id},`,
          'returning empty object. Something is probably gonna go wrong soon'
        ],
        LogPrefix.Zoom
      )
      return {
        app_name: '',
        runner: 'zoom',
        art_cover: '',
        art_square: '',
        install: {},
        is_installed: false,
        title: '',
        canRunOffline: false
      }
    }
    return info
  }

  async importGame(): Promise<ExecResult> {
    // The original zoom.py doesn't have an explicit "import" function for installed games.
    // It relies on scanning the library. This function might need to be adapted
    // if Zoom has a way to import already installed games.
    logWarning(
      `Import game not fully implemented for Zoom: ${this.id}`,
      LogPrefix.Zoom
    )
    return { stdout: '', stderr: 'Import not fully implemented' }
  }

  private defaultTmpProgress = () => ({
    bytes: '',
    eta: '',
    percent: undefined,
    diskSpeed: undefined,
    downSpeed: undefined
  })
  private tmpProgress: InstallProgress | undefined

  onInstallOrUpdateOutput(
    action: 'installing' | 'updating',
    data: string,
    total: number
  ) {
    if (data.length === 0) return

    if (!this.tmpProgress) {
      this.tmpProgress = this.defaultTmpProgress()
    }
    // This part needs to be adapted to parse output from the actual installer.
    // For now, it's a placeholder.
    logDebug(
      `Installer output for ${this.id}: ${data}% (total: ${getFileSize(total)})`,
      LogPrefix.Zoom
    )

    this.tmpProgress.percent = parseInt(data)
    if (this.tmpProgress.percent > 100) {
      this.tmpProgress.percent = 100
    }
    this.tmpProgress.bytes = 'N/A'
    this.tmpProgress.eta = 'N/A'
    this.tmpProgress.downSpeed = 0
    this.tmpProgress.diskSpeed = 0

    sendProgressUpdate({
      appName: this.id,
      runner: 'zoom',
      status: action,
      progress: this.tmpProgress
    })
  }

  /** Downloads each installer into `downloadRoot` (those already there are kept); `undefined` when all are in place */
  private async downloadInstallers(
    installers: ZoomDownloadFile[],
    downloadRoot: string,
    signal: AbortSignal,
    totalSize: number
  ): Promise<InstallResult | undefined> {
    let downloaded = 0
    for (const file of installers) {
      const downloadPath = join(downloadRoot, file.filename)
      let fileDownloaded = 0

      // Create game directory
      fs.mkdirSync(downloadRoot, { recursive: true })

      // Download the installer
      logInfo(
        `Downloading installer from ${file.url} to ${downloadPath}`,
        LogPrefix.Zoom
      )

      if (!fs.existsSync(downloadPath)) {
        try {
          const response = await axios.get(file.url!, {
            responseType: 'stream',
            signal,
            onDownloadProgress: (progressEvent: AxiosProgressEvent) => {
              let percent: undefined | number
              if (progressEvent.bytes) {
                fileDownloaded = fileDownloaded + progressEvent.bytes
                percent = Math.round(
                  ((downloaded + fileDownloaded) * 100) / totalSize
                )
              }

              this.onInstallOrUpdateOutput(
                'installing',
                `${percent}`,
                totalSize
              )
            }
          })

          await saveStreamToFile(response.data, downloadPath)
          logInfo(`Installer downloaded to ${downloadPath}`, LogPrefix.Zoom)

          downloaded = downloaded + parseSize(file.size)
        } catch (error) {
          if (signal.aborted) return { status: 'abort' }
          logError(['Failed to download installer:', error], LogPrefix.Zoom)
          return {
            status: 'error',
            error: `Failed to download installer: ${String(error)}`
          }
        }
      } else {
        logDebug(`File already exists ${downloadPath}, skipping`)
      }
    }
    return undefined
  }

  /** Saves the game as installed, in the installed list and in the library */
  private recordInstalled(installedData: InstalledInfo) {
    installedGamesStore.set(
      'installed',
      upsertInstalled(installedGamesStore.get('installed', []), installedData)
    )
    void libraryManagerMap['zoom'].refresh()
    const libraryGame = this.getGameInfo()
    if (libraryGame) {
      libraryGame.is_installed = true
      libraryGame.install = installedData
      libraryManagerMap['zoom'].updateGameInLibrary(libraryGame)
      libraryStore.set(
        'games',
        libraryStore
          .get('games', [])
          .map((g) => (g.app_name === this.id ? libraryGame : g))
      )
    }
  }

  /** Extracts or runs a native installer; the executable it leaves, or why it failed */
  private async installNative(
    installer: ZoomDownloadFile,
    downloadRoot: string,
    installPath: string,
    signal: AbortSignal
  ): Promise<{ executable: string } | InstallResult> {
    const downloadPath = join(downloadRoot, installer.filename)
    const run = (command: string, args: string[], options: SpawnOptions = {}) =>
      spawnAsync(command, args, { ...options, signal }).catch((error) => {
        if (!signal.aborted) throw error
        return { code: null, stdout: '', stderr: 'Aborted' }
      })

    let installResult: ExecResult
    let executable = ''
    if (downloadPath.endsWith('.tar.xz')) {
      logInfo(`Extracting ${downloadPath}...`, LogPrefix.Zoom)
      installResult = await run('tar', ['-xf', downloadPath, '-C', installPath])
      const files = await fs.promises.readdir(installPath)
      const gameDir = files.find((f) =>
        fs.statSync(join(installPath, f)).isDirectory()
      )
      const exe = join(
        gameDir ? join(installPath, gameDir) : installPath,
        'start.sh'
      )
      if (fs.existsSync(exe)) {
        executable = exe
        await fs.promises.chmod(executable, '755')
      }
    } else {
      executable = downloadPath
      await fs.promises.chmod(executable, '755')
      installResult = await run(executable, [], { cwd: installPath })
    }

    // Aborted (paused): the downloaded installers stay, so resuming does not download them again
    if (signal.aborted) return { status: 'abort' }
    await fs.promises.rm(downloadRoot, { recursive: true, force: true })
    if (installResult.error) {
      logError(
        ['Installer execution failed:', installResult.error],
        LogPrefix.Zoom
      )
      return {
        status: 'error',
        error: `Installer execution failed: ${installResult.error}`
      }
    }
    return { executable }
  }

  /** The installers of the platform, or why there are none */
  private async installersFor(
    platform: ZoomInstallPlatform
  ): Promise<ZoomDownloadFile[] | InstallResult> {
    const installers: ZoomDownloadFile[] = await libraryManagerMap[
      'zoom'
    ].getInstallers(platform, this.id)
    if (installers.length > 0 && installers[0].url) return installers
    logError(`No installer found for ${this.id} on ${platform}`, LogPrefix.Zoom)
    return { status: 'error', error: 'No installer found' }
  }

  /**
   * A Windows installer stays in the prefix for the runner (`.bat`): here it is
   * only prepared, and run now when the mode is `interactive`. The executable
   * of the record is the installer until the runner finds the game's.
   */
  private async prepareWindowsInstaller(
    installer: ZoomDownloadFile,
    installPath: string,
    mode: InstallMode
  ): Promise<{ executable: string } | InstallResult> {
    writeZoomInstallerInf(zoomInstallerFolder(installPath))
    if (mode === 'interactive') {
      const { error } = await installZoomInteractively(
        this.id,
        installPath,
        installer.filename
      )
      if (error) return { status: 'error', error }
    }
    return { executable: installer.filename }
  }

  async install({
    path,
    platformToInstall,
    installLanguage,
    installMode
  }: InstallArgs): Promise<InstallResult> {
    logInfo(
      `Installing ${this.id} to ${path} for platform ${platformToInstall}`,
      LogPrefix.Zoom
    )
    const gameInfo = this.getGameInfo()
    if (!gameInfo?.folder_name) {
      logError(`Game info not found for ${this.id}`, LogPrefix.Zoom)
      return { status: 'error', error: 'Game info not found' }
    }
    const platform = platformToInstall.toLowerCase() as ZoomInstallPlatform
    const installers = await this.installersFor(platform)
    if (!Array.isArray(installers)) return installers

    const installPath = join(path, gameInfo.folder_name)
    const windows = platform === 'windows'
    const downloadRoot = windows
      ? zoomInstallerFolder(installPath)
      : join(path, '.zoom-download')
    fs.mkdirSync(installPath, { recursive: true })
    // Pausing or cancelling aborts this controller (the queue calls it by game id)
    const { signal } = createAbortController(this.id)
    const totalSize = installers.reduce((sum, f) => sum + parseSize(f.size), 0)

    const failed = await this.downloadInstallers(
      installers,
      downloadRoot,
      signal,
      totalSize
    )
    if (failed) return failed

    const prepared = windows
      ? await this.prepareWindowsInstaller(
          installers[0],
          installPath,
          installModeOr(installMode)
        )
      : await this.installNative(
          installers[0],
          downloadRoot,
          installPath,
          signal
        )
    if (!('executable' in prepared)) return prepared
    if (!prepared.executable) return this.noExecutable()

    this.recordInstalled({
      platform,
      executable: prepared.executable,
      install_path: installPath,
      install_size: getFileSize(totalSize),
      is_dlc: false,
      version: '1.0', // Zoom's API gives no version
      appName: this.id,
      installedDLCs: [],
      language: installLanguage,
      versionEtag: '',
      buildId: '',
      pinnedVersion: false
    })
    logInfo(`Installation of ${this.id} completed.`, LogPrefix.Zoom)
    return { status: 'done', installPath }
  }

  private noExecutable(): InstallResult {
    logError(['Could not find executable for', this.id], LogPrefix.Zoom)
    showDialogBoxModalAuto({
      title: 'Executable not found',
      message:
        'Rakun could not find the executable for this game. Please set it manually in the game settings.',
      type: 'ERROR'
    })
    return { status: 'error', error: 'Executable not found' }
  }

  async moveInstall(newInstallPath: string): Promise<InstallResult> {
    const gameInfo = this.getGameInfo()
    logInfo(`Moving ${gameInfo.title} to ${newInstallPath}`, LogPrefix.Zoom)

    const moveResult = await moveOnUnix(newInstallPath, gameInfo)

    if (moveResult.status === 'error') {
      logError(
        [
          'Error moving',
          gameInfo.title,
          'to',
          newInstallPath,
          moveResult.error
        ],
        LogPrefix.Zoom
      )
      return { status: 'error', error: moveResult.error }
    }

    const array = installedGamesStore.get('installed', [])
    const index = array.findIndex((game) => game.appName === this.id)
    if (index === -1) {
      return { status: 'error', error: "Game isn't installed" }
    }

    array[index].install_path = moveResult.installPath
    installedGamesStore.set('installed', array)
    void libraryManagerMap['zoom'].refresh()

    return { status: 'done', installPath: moveResult.installPath }
  }

  async repair(): Promise<ExecResult> {
    logWarning(`Repair not implemented for Zoom: ${this.id}`, LogPrefix.Zoom)
    // An error, so that nobody takes it for a repair that worked (Steam would be told)
    const error = 'Repair is not supported for Zoom games'
    return { stdout: '', stderr: error, error }
  }

  /**
   * Drops the game from the installed list and from the saved library, so that
   * it shows as not installed also after a restart that cannot reach Zoom.
   */
  private markUninstalled(array: InstalledInfo[]) {
    installedGamesStore.set('installed', removeInstalled(array, this.id))
    libraryManagerMap['zoom'].refreshInstalled()
    const gameInfo = this.getGameInfo()
    gameInfo.is_installed = false
    gameInfo.install = { is_dlc: false }
    libraryStore.set(
      'games',
      libraryStore
        .get('games', [])
        .map((g) => (g.app_name === this.id ? gameInfo : g))
    )
    sendFrontendMessage('pushGameToLibrary', gameInfo)
  }

  async uninstall(): Promise<ExecResult> {
    const array = installedGamesStore.get('installed', [])
    const object = array.find((game) => game.appName === this.id)
    if (!object) {
      // The library says installed but the list does not know it: there is
      // nothing to remove, only the stale mark to clear
      logWarning(
        `${this.id} is not in the installed list: clearing its mark`,
        LogPrefix.Zoom
      )
      this.markUninstalled(array)
      return { stdout: 'Uninstalled', stderr: '' }
    }

    logInfo(['Removing', object.install_path], LogPrefix.Zoom)

    if (fs.existsSync(object.install_path)) {
      fs.rmSync(object.install_path, { recursive: true })
    }
    this.markUninstalled(array)
    return { stdout: 'Uninstalled', stderr: '' }
  }

  async update(): Promise<{ status: 'done' | 'error'; error?: string }> {
    logWarning(`Update not implemented for Zoom: ${this.id}`, LogPrefix.Zoom)
    return { status: 'error', error: 'Update not implemented' }
  }

  async forceUninstall(): Promise<void> {
    this.markUninstalled(installedGamesStore.get('installed', []))
  }

  async stop(): Promise<void> {
    // Nothing to kill by name: pausing and cancelling go through the abort
    // controller of the install (see install())
  }

  async isGameAvailable(): Promise<boolean> {
    const info = this.getGameInfo()
    if (!info || !info.is_installed || !info.install.install_path) {
      return false
    }
    return fs.existsSync(info.install.install_path)
  }
}
