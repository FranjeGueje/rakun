import type { DMQueueElement, GameInfo, GameStatus } from 'common/types'
import type { AccountsStatus } from 'common/rakun/accounts'
import type { StoreInfo } from 'common/rakun/stores'
import { storeLabel } from './stores'

export function table(rows: string[][]): string {
  const widths = rows[0]?.map((_, col) =>
    Math.max(...rows.map((row) => row[col].length))
  )
  return rows
    .map((row) =>
      row
        .map((cell, col) => cell.padEnd(widths?.[col] ?? 0))
        .join('  ')
        .trimEnd()
    )
    .join('\n')
}

export function libraryText(games: GameInfo[], stores: StoreInfo[]): string {
  if (!games.length) return 'The library is empty.'
  return table(
    games.map((game) => [
      game.app_name,
      storeLabel(stores, game.runner),
      game.title,
      game.is_installed ? 'installed' : ''
    ])
  )
}

export function accountsText(
  accounts: AccountsStatus,
  stores: StoreInfo[]
): string {
  return stores
    .map(({ id, label }) => {
      const { loggedIn, name } = accounts[id]
      return `${label}: ${loggedIn ? `logged in${name ? ` (${name})` : ''}` : 'not logged in'}`
    })
    .join('\n')
}

export function queueText(
  queue: { elements: DMQueueElement[]; finished: DMQueueElement[] },
  stores: StoreInfo[]
): string {
  const { elements, finished } = queue
  if (!elements.length) return `Queue is empty (${finished.length} finished).`
  const rows = elements.map(({ params, type, status }) => [
    params.appName,
    storeLabel(stores, params.runner),
    params.gameInfo.title,
    type,
    status ?? 'queued'
  ])
  return `${table(rows)}\n(${finished.length} finished)`
}

export function statusLine({ status, context }: GameStatus): string {
  return context ? `${status} (${context})` : status
}

export function progressLine({ progress }: GameStatus): string {
  if (!progress) return ''
  const percent = progress.percent === undefined ? '' : `${progress.percent}% `
  return `${percent}${progress.bytes} ${progress.eta ? `(${progress.eta} left)` : ''}`.trim()
}
