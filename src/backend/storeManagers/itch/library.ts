import { hasDuplicates, uniqueInstalled } from '../installed_list'
import { sendFrontendMessage } from '../../ipc'
import { GameInfo, ExecResult, InstalledInfo } from 'common/types'
import type { ItchGame, ItchInstallInfo, ItchUpload } from 'common/types/itch'
import type { LibraryManager } from 'common/types/game_manager'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { isOnline } from '../../online_monitor'
import ItchGameManager from './games'
import { ItchUser } from './user'
import { getButlerd } from './client'
import {
  configStore,
  installedGamesStore,
  libraryStore
} from './electronStores'
import { itchToGameInfo, pickUpload, uniqueGames } from './library_info'
import { fetchCollectionGames, fetchOwnedGames } from './library_fetch'

const library: Map<string, GameInfo> = new Map()
const installedGames: Map<string, InstalledInfo> = new Map()

export default class ItchLibraryManager implements LibraryManager {
  async init() {
    await this.refresh()
  }

  getGame(id: string): ItchGameManager {
    return new ItchGameManager(id)
  }

  async refresh(): Promise<ExecResult> {
    this.refreshInstalled()
    if (!ItchUser.isLoggedIn()) return { stdout: '', stderr: '' }
    if (!isOnline()) {
      logWarning('App offline, unable to refresh itch library', LogPrefix.Itch)
      return { stdout: '', stderr: 'App offline' }
    }

    try {
      const games = await this.fetchGames()
      library.clear()
      games.forEach((game) => this.addToLibrary(itchToGameInfo(game)))
      this.keepInstalledOutsideLibrary()
    } catch (error) {
      logError(['Failed to refresh the itch library:', error], LogPrefix.Itch)
      return { stdout: '', stderr: 'Error loading library' }
    }
    libraryStore.set('games', Array.from(library.values()))
    logInfo(`Library refreshed: ${library.size} games`, LogPrefix.Itch)
    return { stdout: 'Library refreshed', stderr: '' }
  }

  /** What the user owns, then what is in their collections (the owned game wins when it is in both) */
  private async fetchGames(): Promise<ItchGame[]> {
    const butlerd = await getButlerd()
    const profileId = configStore.get('profileId', 0)
    await butlerd.call('Profile.UseSavedLogin', { profileId })

    const owned = await fetchOwnedGames(butlerd, profileId)
    const collected = await fetchCollectionGames(butlerd, profileId).catch(
      (error: unknown) => {
        logWarning(['Could not read the collections:', error], LogPrefix.Itch)
        return []
      }
    )
    return uniqueGames([owned, collected])
  }

  /** A game installed by its id is in no list: it stays while it is installed */
  private keepInstalledOutsideLibrary() {
    const previous = libraryStore.get('games', [])
    installedGames.forEach((_, appName) => {
      const info = previous.find((game) => game.app_name === appName)
      if (info && !library.has(appName)) this.addToLibrary(info)
    })
  }

  /**
   * Makes a game that is in no list of the user's part of the library, by its id
   * on itch.io, so that it can be installed (a free one installs without owning it).
   * Does nothing for a game already there or for anything that is not an id.
   */
  async ensureGame(appName: string): Promise<void> {
    if (this.getGameInfo(appName) || !/^\d+$/.test(appName)) return
    if (!ItchUser.isLoggedIn()) return
    try {
      const butlerd = await getButlerd()
      const { game } = await butlerd.call<{ game: ItchGame }>('Fetch.Game', {
        gameId: Number(appName)
      })
      const info = itchToGameInfo(game)
      this.addToLibrary(info)
      // The saved list, not the one in memory (empty until the first refresh)
      const saved = libraryStore.get('games', [])
      libraryStore.set('games', [
        ...saved.filter((game) => game.app_name !== info.app_name),
        info
      ])
    } catch (error) {
      logWarning([`itch.io has no game ${appName}:`, error], LogPrefix.Itch)
    }
  }

  private addToLibrary(info: GameInfo) {
    const installed = installedGames.get(info.app_name)
    if (installed) {
      info.is_installed = true
      info.install = installed
    }
    library.set(info.app_name, info)
    sendFrontendMessage('pushGameToLibrary', info)
  }

  refreshInstalled() {
    const installed = installedGamesStore.get('installed', [])
    if (hasDuplicates(installed))
      installedGamesStore.set('installed', uniqueInstalled(installed))
    installedGames.clear()
    installed.forEach((info) => {
      if (info.appName) installedGames.set(info.appName, info)
    })
  }

  getGameInfo(appName: string): GameInfo | undefined {
    const game =
      library.get(appName) ??
      libraryStore.get('games', []).find((info) => info.app_name === appName)
    const installed = installedGames.get(appName)
    return game && installed
      ? { ...game, is_installed: true, install: installed }
      : game
  }

  updateGameInLibrary(game: GameInfo) {
    if (library.has(game.app_name)) library.set(game.app_name, game)
  }

  async getInstallInfo(
    appName: string,
    installPlatform: string
  ): Promise<ItchInstallInfo | undefined> {
    const title = this.getGameInfo(appName)?.title
    const upload = await this.findUpload(appName, installPlatform)
    if (!title || !upload) return undefined

    const size = upload.size ?? 0
    return {
      game: {
        app_name: appName,
        title,
        owned_dlc: [],
        version: 'N/A',
        launch_options: [],
        branches: [],
        buildId: String(upload.id)
      },
      manifest: {
        app_name: appName,
        disk_size: size,
        download_size: size,
        languages: [],
        versionEtag: '',
        dependencies: [],
        perLangSize: { '*': { download_size: size, disk_size: size } }
      }
    }
  }

  /** The upload that would be installed for a platform, if the game has one */
  async findUpload(
    appName: string,
    platform: string
  ): Promise<ItchUpload | undefined> {
    if (platform !== 'windows' && platform !== 'linux') return undefined
    const butlerd = await getButlerd()
    const { uploads } = await butlerd.call<{ uploads: ItchUpload[] }>(
      'Fetch.GameUploads',
      {
        profileId: configStore.get('profileId', 0),
        gameId: Number(appName),
        fresh: true
      }
    )
    return pickUpload(uploads, platform)
  }

  async changeGameInstallPath(): Promise<void> {
    logWarning('Moving an itch game is not supported', LogPrefix.Itch)
  }

  changeVersionPinnedStatus() {
    // butler has no version pinning
  }

  /** The installed games butler says have a newer build */
  async listUpdateableGames(): Promise<string[]> {
    const caveIds = installedGamesStore
      .get('installed', [])
      .flatMap((info) => (info.caveId ? [info.caveId] : []))
    if (!caveIds.length || !ItchUser.isLoggedIn()) return []
    try {
      const butlerd = await getButlerd()
      const { updates } = await butlerd.call<{
        updates: { game: { id: number } }[]
      }>('CheckUpdate', { caveIds })
      return updates.map(({ game }) => String(game.id))
    } catch (error) {
      logError(['Could not check itch updates:', error], LogPrefix.Itch)
      return []
    }
  }
}
