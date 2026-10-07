import type { GameInfo } from 'common/types'
import type { LibraryManager } from 'common/types/game_manager'

/** GOG and Zoom keep what is installed in a separate store */
export function withInstallInfo(
  games: GameInfo[],
  installed: GameInfo['install'][]
): GameInfo[] {
  return games.map((game) => {
    const install = installed.find((info) => info?.appName === game.app_name)
    return install ? { ...game, install, is_installed: true } : game
  })
}

/**
 * The Epic and Amazon stores are only rewritten by a refresh, so installing or
 * uninstalling a game does not show in them; their managers do keep it current
 */
export function withLiveInfo(
  manager: LibraryManager,
  games: GameInfo[]
): GameInfo[] {
  return games.map((game) => manager.getGameInfo(game.app_name) ?? game)
}
