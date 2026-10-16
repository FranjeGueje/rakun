import { pickWindowsExecutable } from './executables'
import {
  getFileSize,
  parseSize,
  spawnAsync,
  sendProgressUpdate,
  moveOnUnix
} from '../../utils'
import { join, dirname } from 'node:path'
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
  InstallProgress
} from 'common/types'
import { existsSync, rmSync } from 'fs'
import { installedGamesStore, libraryStore } from './stores'
import {
  logError,
  logInfo,
  LogPrefix,
  logWarning,
  logDebug
} from 'backend/logger'

import { helperFile } from 'backend/rakun/helpers/locations'
import { GlobalConfig } from 'backend/config'
import { ZoomInstallPlatform, ZoomDownloadFile } from 'common/types/zoom'
import { showDialogBoxModalAuto } from '../../dialog/dialog'
import { sendFrontendMessage } from '../../ipc'
import { Game, InstallResult } from 'common/types/game_manager'
import { displayForInstaller } from './display'
import { removeInstalled, upsertInstalled } from '../installed_list'
import { libraryManagerMap } from '..'

import { rm } from 'node:fs/promises'
import { createAbortController } from 'backend/utils/aborthandler/aborthandler'

export default class ZoomGame implements Game {
  private readonly id: string

  constructor(id: string) {
    this.id = id
  }

  private async findDosboxExecutable(dir: string): Promise<string | undefined> {
    let list: fs.Dirent[]
    try {
      list = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch (error) {
      logError(
        `Error reading directory ${dir} for dosbox.exe: ${String(error)}`,
        LogPrefix.Zoom
      )
      return undefined // Cannot read dir, so stop here for this branch
    }

    for (const file of list) {
      const fullPath = join(dir, file.name)
      if (file.isDirectory()) {
        const result = await this.findDosboxExecutable(fullPath)
        if (result) {
          return result
        }
      } else if (file.name.toLowerCase() === 'dosbox.exe') {
        return fullPath
      }
    }

    return undefined
  }

  private async findConfFiles(dir: string): Promise<string[]> {
    let confFiles: string[] = []
    try {
      const list = await fs.promises.readdir(dir, { withFileTypes: true })
      for (const file of list) {
        const fullPath = join(dir, file.name)
        if (file.isDirectory()) {
          confFiles = confFiles.concat(await this.findConfFiles(fullPath))
        } else if (file.name.toLowerCase().endsWith('.conf')) {
          confFiles.push(fullPath)
        }
      }
    } catch (error) {
      logError(
        `Error finding .conf files in ${dir}: ${String(error)}`,
        LogPrefix.Zoom
      )
    }
    return confFiles
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

      if (!existsSync(downloadPath)) {
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

  async install({
    path,
    platformToInstall,
    installLanguage
  }: InstallArgs): Promise<InstallResult> {
    logInfo(
      `Installing ${this.id} to ${path} for platform ${platformToInstall}`,
      LogPrefix.Zoom
    )
    logInfo(`Installation path: ${path}`, LogPrefix.Zoom)

    const gameInfo = this.getGameInfo()
    if (!gameInfo || !gameInfo.folder_name) {
      logError(`Game info not found for ${this.id}`, LogPrefix.Zoom)
      return { status: 'error', error: 'Game info not found' }
    }

    const installPlatform =
      platformToInstall.toLowerCase() as ZoomInstallPlatform
    let finalInstallPlatform = installPlatform

    // Fetch installer URL
    const installers: ZoomDownloadFile[] = await libraryManagerMap[
      'zoom'
    ].getInstallers(installPlatform, this.id)
    if (installers.length === 0 || !installers[0].url) {
      logError(
        `No installer found for ${this.id} on ${installPlatform}`,
        LogPrefix.Zoom
      )
      return { status: 'error', error: 'No installer found' }
    }

    if (installPlatform === 'windows') {
      const display = displayForInstaller()
      if (!display.ok) {
        logError(`Not downloading: ${display.reason}`, LogPrefix.Zoom)
        return {
          status: 'error',
          error: `${display.reason}. Zoom's Windows installers open a window: start rakun from a desktop session and try again`
        }
      }
    }

    const installPath = join(path, gameInfo.folder_name)
    const downloadRoot = join(path, '.zoom-download')

    fs.mkdirSync(installPath, { recursive: true })

    // Pausing or cancelling aborts this controller (the queue calls it by game id)
    const { signal } = createAbortController(this.id)
    const run = (command: string, args: string[], options: SpawnOptions = {}) =>
      spawnAsync(command, args, { ...options, signal }).catch((error) => {
        if (!signal.aborted) throw error
        return { code: null, stdout: '', stderr: 'Aborted' }
      })

    const totalSize = installers
      .map((file) => parseSize(file.size))
      .reduce((acc, num) => acc + num, 0)

    const failed = await this.downloadInstallers(
      installers,
      downloadRoot,
      signal,
      totalSize
    )
    if (failed) return failed

    // Execute the installer
    let installResult: ExecResult
    const confFilesBefore: string[] = []
    let executable: string = ''

    if (installPlatform === 'linux') {
      const downloadPath = join(downloadRoot, installers[0].filename)

      if (downloadPath.endsWith('.tar.xz')) {
        logInfo(`Extracting ${downloadPath}...`, LogPrefix.Zoom)
        installResult = await run('tar', [
          '-xf',
          downloadPath,
          '-C',
          installPath
        ])
        let gamePath = installPath
        const files = await fs.promises.readdir(installPath)
        const gameDir = files.find((f) =>
          fs.statSync(join(path, gameInfo.folder_name!, f)).isDirectory()
        )
        if (gameDir) {
          gamePath = join(installPath, gameDir)
        }

        const exe = join(gamePath, 'start.sh')
        if (existsSync(exe)) {
          executable = exe
          await fs.promises.chmod(executable, '755')
        }
      } else {
        executable = downloadPath
        await fs.promises.chmod(executable, '755')
        installResult = await run(executable, [], {
          cwd: installPath
        })
      }
    } else {
      const downloadPath = join(downloadRoot, installers[0].filename)
      const protonPath = GlobalConfig.get().getProtonPath()
      const zoomPlatformScript = helperFile(join('zoom', 'zoom-platform.sh'))
      if (!protonPath) {
        logWarning(
          'No GE-Proton configured for Windows installer. Set it with: rakunctl config protonPath <folder>',
          LogPrefix.Zoom
        )
        installResult = {
          stdout: '',
          stderr: 'No GE-Proton configured',
          error: 'No GE-Proton configured'
        }
      } else if (!existsSync(zoomPlatformScript)) {
        const error = `zoom-platform.sh is not installed (${zoomPlatformScript}). Run: rakunctl helpers update`
        logError(error, LogPrefix.Zoom)
        installResult = { stdout: '', stderr: error, error }
      } else {
        logInfo(
          `Running zoom-platform.sh: PROTONPATH=${protonPath} ${zoomPlatformScript} -i ${downloadPath} -d ${installPath}`,
          LogPrefix.Zoom
        )
        const scriptResult = await run(
          'bash',
          [zoomPlatformScript, '-i', downloadPath, '-d', installPath],
          {
            env: { ...process.env, PROTONPATH: protonPath }
          }
        )
        installResult = {
          stdout: scriptResult.stdout,
          stderr: scriptResult.stderr
        }
        if (scriptResult.code === 0) {
          logInfo('Windows installer completed successfully', LogPrefix.Zoom)
          finalInstallPlatform = 'windows'
        } else {
          logError(
            ['Windows installer failed:', scriptResult.stderr],
            LogPrefix.Zoom
          )
          installResult.error = `zoom-platform.sh failed (code ${scriptResult.code})`
        }
      }
    }

    // The downloaded installers stay, so resuming does not download them again
    if (signal.aborted) return { status: 'abort' }

    if (installResult.error) {
      logError(
        ['Installer execution failed:', installResult.error],
        LogPrefix.Zoom
      )
      await rm(downloadRoot, { recursive: true, force: true })
      return {
        status: 'error',
        error: `Installer execution failed: ${installResult.error}`
      }
    }

    await rm(downloadRoot, { recursive: true, force: true })

    // After successful installation, we need to determine the actual executable path
    let isDosbox = false
    let finalExecutable = ''

    if (installPlatform === 'windows') {
      logInfo(`Searching for executable in ${installPath}`, LogPrefix.Zoom)

      const confFilesAfter = await this.findConfFiles(installPath)
      const newConfFiles = confFilesAfter.filter(
        (f) => !confFilesBefore.includes(f)
      )

      if (newConfFiles.length > 0) {
        const gameDirectory = dirname(newConfFiles[0])
        const dosboxExePath = await this.findDosboxExecutable(gameDirectory)
        if (dosboxExePath) {
          isDosbox = true
          finalExecutable = 'dosbox'
          finalInstallPlatform = 'linux'
          const sourceDir = gameDirectory
          const destDir = join(path, gameInfo.folder_name)
          logInfo(
            `Copying DOSBox game files from ${sourceDir} to ${destDir}`,
            LogPrefix.Zoom
          )
          const items = await fs.promises.readdir(sourceDir)
          for (const item of items) {
            await fs.promises.cp(join(sourceDir, item), join(destDir, item), {
              recursive: true
            })
          }
        }
      }

      if (!isDosbox) {
        finalExecutable = await pickWindowsExecutable(
          installPath,
          gameInfo.title
        )
      }
    } else {
      finalExecutable = executable
    }
    if (!finalExecutable) {
      logError(['Could not find executable for', this.id], LogPrefix.Zoom)
      showDialogBoxModalAuto({
        title: 'Executable not found',
        message:
          'Rakun could not find the executable for this game. Please set it manually in the game settings.',
        type: 'ERROR'
      })
      return { status: 'error', error: 'Executable not found' }
    }

    const installedData: InstalledInfo = {
      platform: finalInstallPlatform,
      executable: finalExecutable.replace('{app}', installPath),
      install_path: installPath,
      install_size: getFileSize(totalSize), // This might need to be the actual installed size, not just installer size
      is_dlc: false,
      version: '1.0', // Placeholder, ideally extracted from installer or API
      appName: this.id,
      installedDLCs: [],
      language: installLanguage,
      versionEtag: '',
      buildId: '',
      pinnedVersion: false
    }
    this.recordInstalled(installedData)

    logInfo(`Installation of ${this.id} completed.`, LogPrefix.Zoom)
    return { status: 'done', installPath }
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

  async uninstall(): Promise<ExecResult> {
    const array = installedGamesStore.get('installed', [])
    const object = array.find((game) => game.appName === this.id)
    if (!object) {
      throw Error("Game isn't installed")
    }

    logInfo(['Removing', object.install_path], LogPrefix.Zoom)

    if (existsSync(object.install_path)) {
      rmSync(object.install_path, { recursive: true })
    }
    installedGamesStore.set('installed', removeInstalled(array, this.id))
    void libraryManagerMap['zoom'].refresh()
    const gameInfo = this.getGameInfo()
    gameInfo.is_installed = false
    gameInfo.install = { is_dlc: false }
    sendFrontendMessage('pushGameToLibrary', gameInfo)
    return { stdout: 'Uninstalled', stderr: '' }
  }

  async update(): Promise<{ status: 'done' | 'error'; error?: string }> {
    logWarning(`Update not implemented for Zoom: ${this.id}`, LogPrefix.Zoom)
    return { status: 'error', error: 'Update not implemented' }
  }

  async forceUninstall(): Promise<void> {
    const installed = installedGamesStore.get('installed', [])
    const newInstalled = installed.filter((g) => g.appName !== this.id)
    installedGamesStore.set('installed', newInstalled)
    void libraryManagerMap['zoom'].refresh()
    const gameInfo = this.getGameInfo()
    gameInfo.is_installed = false
    gameInfo.install = { is_dlc: false }
    sendFrontendMessage('pushGameToLibrary', gameInfo)
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
    return existsSync(info.install.install_path)
  }
}
