import type { GameInfo, Runner } from 'common/types'
import { addHandler } from 'backend/ipc'
import { attachOverrides } from 'backend/game_overrides'
import { libraryStore as epicLibraryStore } from 'backend/storeManagers/legendary/electronStores'
import {
  libraryStore as gogLibraryStore,
  installedGamesStore as gogInstalledGamesStore
} from 'backend/storeManagers/gog/electronStores'
import { libraryStore as nileLibraryStore } from 'backend/storeManagers/nile/electronStores'
import {
  libraryStore as zoomLibraryStore,
  installedGamesStore as zoomInstalledGamesStore
} from 'backend/storeManagers/zoom/electronStores'

const RUNNERS: Runner[] = ['legendary', 'gog', 'nile', 'zoom']

/** GOG and Zoom keep what is installed in a separate store */
function withInstallInfo(
  games: GameInfo[],
  installed: GameInfo['install'][]
): GameInfo[] {
  return games.map((game) => {
    const install = installed.find((info) => info?.appName === game.app_name)
    return install ? { ...game, install, is_installed: true } : game
  })
}

const libraries: Record<Runner, () => GameInfo[]> = {
  legendary: () => epicLibraryStore.get('library', []),
  nile: () => nileLibraryStore.get('library', []),
  gog: () =>
    withInstallInfo(
      gogLibraryStore.get('games', []),
      gogInstalledGamesStore.get('installed', [])
    ),
  zoom: () =>
    withInstallInfo(
      zoomLibraryStore.get('games', []),
      zoomInstalledGamesStore.get('installed', [])
    )
}

/** The games of one store (or all of them) as last refreshed, with install state */
addHandler('getLibrary', (_e, library = 'all') => {
  const runners = library === 'all' ? RUNNERS : [library]
  return runners.flatMap((runner) => libraries[runner]().map(attachOverrides))
})
