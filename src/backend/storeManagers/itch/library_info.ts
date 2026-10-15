import type { GameInfo } from 'common/types'
import type { ItchGame, ItchUpload } from 'common/types/itch'

/** A folder name for the game: its title, with what a file system dislikes taken out */
export function folderNameOf(game: ItchGame): string {
  return game.title.replace(/[^\p{L}\p{N} ._-]/gu, '').trim() || String(game.id)
}

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
    folder_name: folderNameOf(game),
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

/**
 * The upload to install on a platform: one that has a build for it, the main
 * file of the game (`default`) before extras such as demos or soundtracks.
 */
export function pickUpload(
  uploads: ItchUpload[],
  platform: 'windows' | 'linux'
): ItchUpload | undefined {
  const fits = uploads.filter((upload) => upload.platforms?.[platform])
  return fits.find((upload) => upload.type === 'default') ?? fits[0]
}
