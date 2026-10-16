import type { DMQueueElement, GameInfo, GameStatus } from 'common/types'
import type { AccountsCheck, AccountsStatus } from 'common/rakun/accounts'
import type { LoginInfo } from 'common/rakun/login'
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

/** What `login` shows: the page and what to do; with a second way, the two numbered so they are told apart */
export function loginText(info: LoginInfo): string {
  const { alternative } = info
  if (!alternative) return `${info.instructions}\n\n${info.url}\n`
  return [
    'There are two ways to log in:',
    '',
    `1) ${info.instructions}`,
    `   ${info.url}`,
    '',
    `2) ${alternative.instructions}`,
    `   ${alternative.url}`,
    ''
  ].join('\n')
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
  stores: StoreInfo[],
  checked?: AccountsCheck
): string {
  return stores
    .map(({ id, label }) => {
      const { loggedIn, name } = accounts[id]
      const asked = checked?.[id]
      // The store was asked and refused a session that was stored here
      if (loggedIn && asked?.verified && !asked.loggedIn)
        return `${label}: session expired, log in again`
      const who = loggedIn
        ? `logged in${name ? ` (${name})` : ''}`
        : 'not logged in'
      return `${label}: ${who}${loggedIn && asked?.verified ? ', verified' : ''}`
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
