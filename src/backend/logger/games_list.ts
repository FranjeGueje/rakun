import type { GameInfo } from 'common/types'

/** One line per game, sorted ignoring case, with a total: what a store log shows */
export function gamesListText(games: GameInfo[]): string {
  const lines = games
    .map(
      ({ title, app_name, install }) =>
        `* ${title} (App name: ${app_name})${install?.is_dlc ? ' - DLC' : ''}`
    )
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))

  return `Games List:\n${lines.join('\n')}\n\nTotal: ${lines.length}\n`
}
