import { existsSync } from 'fs'
import type {
  ExecResult,
  ExtraInfo,
  GameInfo,
  GameStatus,
  InstallArgs,
  InstalledInfo
} from 'common/types'
import type { ItchGame, ItchUpload } from 'common/types/itch'
import type { Game, InstallResult } from 'common/types/game_manager'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  onGameInstalled,
  onGameRepaired,
  onGameUninstalled
} from 'backend/rakun/game_events'
import { sendFrontendMessage } from '../../ipc'
import { sendProgressUpdate } from '../../utils'
import { libraryManagerMap } from '..'
import { removeInstalled, upsertInstalled } from '../installed_list'
import type { Butlerd } from './butlerd'
import { getButlerd } from './client'
import { installedGamesStore } from './electronStores'
import { installLocationFor } from './install_location'
import { toInstallProgress, type ButlerProgress } from './progress'
import { findExecutable, writeStartScript, type Platform } from './executable'

type Queued = {
  id: string
  caveId: string
  installFolder: string
  stagingFolder: string
}

const NOT_SUPPORTED = 'Not supported for itch.io games'

export default class ItchGameManager implements Game {
  constructor(private readonly id: string) {}

  getGameInfo(): GameInfo {
    const info = libraryManagerMap['itch'].getGameInfo(this.id)
    if (info) return info
    logError(`No game info for ${this.id}`, LogPrefix.Itch)
    return {
      app_name: '',
      runner: 'itch',
      art_cover: '',
      art_square: '',
      install: {},
      is_installed: false,
      title: '',
      canRunOffline: false
    }
  }

  async getExtraInfo(): Promise<ExtraInfo> {
    const { description } = this.getGameInfo()
    return {
      about: { description: description ?? '', shortDescription: '' },
      reqs: []
    }
  }

  async install({
    path,
    platformToInstall
  }: InstallArgs): Promise<InstallResult> {
    const platform = platformToInstall.toLowerCase()
    logInfo(`Installing ${this.id} (${platform}) in ${path}`, LogPrefix.Itch)
    try {
      const upload = await libraryManagerMap['itch'].findUpload(
        this.id,
        platform
      )
      if (!upload) return { status: 'error', error: `No ${platform} build` }
      const queued = await this.runInstall(path, upload)
      await this.saveInstalled(
        queued,
        platform === 'linux' ? 'linux' : 'windows'
      )
      this.inBackground(onGameInstalled(this, queued.installFolder))
      return { status: 'done' }
    } catch (error) {
      logError([`Install of ${this.id} failed:`, error], LogPrefix.Itch)
      return { status: 'error', error: String(error) }
    }
  }

  /** Steam is not the install: a failure there is logged, it does not undo a game that is on the disk */
  private inBackground(done: Promise<unknown>) {
    done.catch((error: unknown) =>
      logError(
        [`Steam integration of ${this.id} failed:`, error],
        LogPrefix.Itch
      )
    )
  }

  /** A new install: butler needs the game, the upload and a folder it knows */
  private async runInstall(path: string, upload: ItchUpload): Promise<Queued> {
    const butlerd = await getButlerd()
    const { game } = await butlerd.call<{ game: ItchGame }>('Fetch.Game', {
      gameId: Number(this.id)
    })
    const installLocationId = await installLocationFor(butlerd, path)
    return this.perform(
      { game, upload, installLocationId, reason: 'install' },
      'installing'
    )
  }

  /** Asks butler to queue an operation and carry it out, reporting what it says as it goes */
  private async perform(
    request: object,
    status: 'installing' | 'updating' | 'repairing'
  ): Promise<Queued> {
    const butlerd = await getButlerd()
    const stopListening = butlerd.on('Progress', (params) =>
      this.reportProgress(params as ButlerProgress, status)
    )
    try {
      const queued = await butlerd.call<Queued>('Install.Queue', request)
      await butlerd.call('Install.Perform', {
        id: queued.id,
        stagingFolder: queued.stagingFolder
      })
      return queued
    } finally {
      stopListening()
    }
  }

  private reportProgress(
    progress: ButlerProgress,
    status: GameStatus['status']
  ) {
    sendProgressUpdate({
      appName: this.id,
      runner: 'itch',
      status,
      progress: toInstallProgress(progress)
    })
  }

  /** What Steam will run: the executable butler finds and, on Linux, a `start.sh` that runs it */
  private async prepareExecutable(
    folder: string,
    platform: Platform
  ): Promise<string> {
    try {
      const executable = await findExecutable(folder, platform)
      if (!executable) throw Error(`butler found nothing to run in ${folder}`)
      if (platform === 'linux') writeStartScript(folder, executable)
      return executable
    } catch (error) {
      logWarning([`No executable for ${this.id}:`, error], LogPrefix.Itch)
      return ''
    }
  }

  /** Saves the install and returns its executable (empty when butler finds none) */
  private async saveInstalled(
    queued: Queued,
    platform: Platform
  ): Promise<string> {
    const executable = await this.prepareExecutable(
      queued.installFolder,
      platform
    )
    const installed: InstalledInfo = {
      appName: this.id,
      platform,
      install_path: queued.installFolder,
      executable,
      install_size: '',
      is_dlc: false,
      version: 'N/A',
      caveId: queued.caveId
    }
    installedGamesStore.set(
      'installed',
      upsertInstalled(installedGamesStore.get('installed', []), installed)
    )
    this.publish({ is_installed: true, install: installed })
    return executable
  }

  /** Tells the library and the clients how the game stands now */
  private publish(change: Pick<GameInfo, 'is_installed' | 'install'>) {
    libraryManagerMap['itch'].refreshInstalled()
    sendFrontendMessage('pushGameToLibrary', {
      ...this.getGameInfo(),
      ...change
    })
  }

  async uninstall(): Promise<ExecResult> {
    const installed = installedGamesStore
      .get('installed', [])
      .find((info) => info.appName === this.id)
    if (!installed) throw Error("Game isn't installed")

    if (installed.caveId) await this.removeCave(installed.caveId)
    this.forgetInstalled()
    await onGameUninstalled(this)
    return { stdout: 'Uninstalled', stderr: '' }
  }

  private async removeCave(caveId: string) {
    const butlerd: Butlerd = await getButlerd()
    await butlerd.call('Uninstall.Perform', { caveId, hard: true })
  }

  async forceUninstall(): Promise<void> {
    this.forgetInstalled()
  }

  private forgetInstalled() {
    installedGamesStore.set(
      'installed',
      removeInstalled(installedGamesStore.get('installed', []), this.id)
    )
    this.publish({ is_installed: false, install: { is_dlc: false } })
  }

  async isGameAvailable(): Promise<boolean> {
    const { install } = this.getGameInfo()
    return Boolean(install.install_path && existsSync(install.install_path))
  }

  async importGame(): Promise<ExecResult> {
    return { stdout: '', stderr: NOT_SUPPORTED }
  }

  async moveInstall(): Promise<InstallResult> {
    return { status: 'error', error: NOT_SUPPORTED }
  }

  /** Re-runs butler's operation on the install it already has (`heal` checks it against its receipt) */
  private async redo(
    reason: 'heal' | 'update',
    status: 'updating' | 'repairing'
  ): Promise<InstallResult> {
    const { caveId, platform, executable } = this.getGameInfo().install
    if (!caveId) return { status: 'error', error: "Game isn't installed" }
    try {
      const queued = await this.perform({ caveId, reason }, status)
      // The operation can change what there is to run
      const now = await this.saveInstalled(
        queued,
        platform === 'linux' ? 'linux' : 'windows'
      )
      // The `.bat` of the game names its executable: an update that moves it needs a new one
      if (reason === 'update' && now !== executable)
        this.inBackground(onGameRepaired(this))
      return { status: 'done' }
    } catch (error) {
      logError([`${reason} of ${this.id} failed:`, error], LogPrefix.Itch)
      return { status: 'error', error: String(error) }
    }
  }

  async repair(): Promise<ExecResult> {
    const { status, error } = await this.redo('heal', 'repairing')
    return { stdout: status, stderr: error ?? '', error }
  }

  async update(): Promise<InstallResult> {
    return this.redo('update', 'updating')
  }

  async stop(): Promise<void> {
    // rakun never runs the games
  }
}
