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
import { onGameRepaired, onGameUninstalled } from 'backend/rakun/game_events'
import { sendFrontendMessage } from '../../ipc'
import { sendProgressUpdate } from '../../utils'
import { libraryManagerMap } from '..'
import { removeInstalled, upsertInstalled } from '../installed_list'
import { ButlerdError, type Butlerd } from './butlerd'
import { getButlerd } from './client'
import { installedGamesStore } from './electronStores'
import { installLocationFor } from './install_location'
import { toInstallProgress, type ButlerProgress } from './progress'
import { findExecutable, writeStartScript, type Platform } from './executable'
import {
  abortControllerOf,
  discardPartialInstall,
  inTurn,
  OperationAborted,
  runOperation,
  type Queued
} from './operation'

const NOT_SUPPORTED = 'Not supported for itch.io games'

const noExecutable = ({ installFolder }: Queued) =>
  `Installed, but there is no executable to run in ${installFolder}`

/** butler has no such install: it is already gone, which is what an uninstall wants */
const isMissingCave = (error: unknown) =>
  error instanceof ButlerdError &&
  /not found|no such|does not exist/i.test(error.message)

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
      return await this.finishInstall(queued, platform)
    } catch (error) {
      if (error instanceof OperationAborted) {
        discardPartialInstall(error.queued, path)
        return { status: 'abort' }
      }
      logError([`Install of ${this.id} failed:`, error], LogPrefix.Itch)
      return { status: 'error', error: String(error) }
    }
  }

  /**
   * The game is on the disk: it is saved (so that it can be repaired or uninstalled) and, if there
   * is something to run, it goes to Steam. A game with nothing to run is installed, but it is an error.
   */
  private async finishInstall(
    queued: Queued,
    platform: string
  ): Promise<InstallResult> {
    const executable = await this.saveInstalled(
      queued,
      platform === 'linux' ? 'linux' : 'windows'
    )
    if (!executable) return { status: 'error', error: noExecutable(queued) }
    return { status: 'done', installPath: queued.installFolder }
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

  /** Asks butler to queue an operation and carry it out, one at a time, reporting what it says as it goes */
  private async perform(
    request: object,
    status: 'installing' | 'updating' | 'repairing'
  ): Promise<Queued> {
    const abort = abortControllerOf(this.id)
    try {
      return await inTurn(async () =>
        runOperation(await getButlerd(), abort.signal, request, (params) =>
          this.reportProgress(params as ButlerProgress, status)
        )
      )
    } finally {
      abort.drop()
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
    try {
      await butlerd.call('Uninstall.Perform', { caveId, hard: true })
    } catch (error) {
      if (!isMissingCave(error)) throw error
      logWarning(
        `butler has no install ${caveId}: forgetting it`,
        LogPrefix.Itch
      )
    }
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
      if (!now) return { status: 'error', error: noExecutable(queued) }
      // The `.bat` of the game names its executable: an update that moves it needs a new one
      if (reason === 'update' && now !== executable)
        this.inBackground(onGameRepaired(this))
      return { status: 'done' }
    } catch (error) {
      if (error instanceof OperationAborted) return { status: 'abort' }
      logError([`${reason} of ${this.id} failed:`, error], LogPrefix.Itch)
      return { status: 'error', error: String(error) }
    }
  }

  async repair(): Promise<ExecResult> {
    const { status, error } = await this.redo('heal', 'repairing')
    // An error, also when it was cancelled: the Steam part of a repair is not for a repair that did not end
    if (status === 'abort')
      return { stdout: '', stderr: '', error: 'Cancelled', abort: true }
    return { stdout: status, stderr: error ?? '', error }
  }

  async update(): Promise<InstallResult> {
    return this.redo('update', 'updating')
  }

  async stop(): Promise<void> {
    // rakun never runs the games
  }
}
