import type { GameInfo } from 'common/types'
import type { ItchGame, ItchUpload } from 'common/types/itch'

/** What rakun shows of a game butlerd listed */
export function itchToGameInfo(game: ItchGame): GameInfo {
  const cover = game.coverUrl ?? game.stillCoverUrl ?? ''
  return {
    runner: 'itch',
    app_name: String(game.id),
    title: game.title,
    art_cover: cover,
    art_square: cover,
    art_background: cover,
    developer: game.user?.displayName ?? game.user?.username,
    description: game.shortText,
    store_url: game.url,
    install: { is_dlc: false },
    is_installed: false,
    canRunOffline: true,
    cloud_save_enabled: false,
    is_windows_native: Boolean(game.platforms?.windows),
    is_linux_native: Boolean(game.platforms?.linux),
    is_mac_native: Boolean(game.platforms?.osx)
  }
}

/** A game as it is saved: whether it is installed lives in the installed list, not here */
export function withoutInstall(info: GameInfo): GameInfo {
  return { ...info, is_installed: false, install: { is_dlc: false } }
}

/** The games of every list, each once (the first one found is kept) */
export function uniqueGames(lists: ItchGame[][]): ItchGame[] {
  const byId = new Map<number, ItchGame>()
  lists.flat().forEach((game) => {
    if (!byId.has(game.id)) byId.set(game.id, game)
  })
  return Array.from(byId.values())
}

/**
 * The upload to install on a platform: one that has a build for it, the main
 * file of the game (`default`) before extras such as demos or soundtracks.
 */
export function pickUpload(
  uploads: ItchUpload[],
  platform: 'windows' | 'linux'
): ItchUpload | undefined {
  // butler's lists are Go slices: with nothing in them they can come as `null`
  const fits = (uploads ?? []).filter((upload) => upload.platforms?.[platform])
  return fits.find((upload) => upload.type === 'default') ?? fits[0]
}
