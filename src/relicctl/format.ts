import type { DMQueueElement, GameInfo, GameStatus, Runner } from 'common/types'
import type { AccountsStatus } from 'common/relic/accounts'
import { STORES, storeLabel } from './stores'

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

export function libraryText(games: GameInfo[]): string {
  if (!games.length) return 'La biblioteca está vacía.'
  return table(
    games.map((game) => [
      game.app_name,
      storeLabel(game.runner),
      game.title,
      game.is_installed ? 'instalado' : ''
    ])
  )
}

export function accountsText(accounts: AccountsStatus): string {
  return STORES.map(({ runner, label }) => {
    const { loggedIn, name } = accounts[runner]
    return `${label}: ${loggedIn ? `sesión iniciada${name ? ` (${name})` : ''}` : 'sin sesión'}`
  }).join('\n')
}

export function queueText(queue: {
  elements: DMQueueElement[]
  finished: DMQueueElement[]
}): string {
  const { elements, finished } = queue
  if (!elements.length) return `Cola vacía (${finished.length} terminadas).`
  const rows = elements.map(({ params, type, status }) => [
    params.appName,
    storeLabel(params.runner),
    params.gameInfo.title,
    type,
    status ?? 'en cola'
  ])
  return `${table(rows)}\n(${finished.length} terminadas)`
}

export function statusLine({ status, context }: GameStatus): string {
  return context ? `${status} (${context})` : status
}

export function progressLine({ progress }: GameStatus): string {
  if (!progress) return ''
  const percent = progress.percent === undefined ? '' : `${progress.percent}% `
  return `${percent}${progress.bytes} ${progress.eta ? `(quedan ${progress.eta})` : ''}`.trim()
}

export function sessionsImportText(result: Record<Runner, string>): string {
  return STORES.map(({ runner, label }) => `${label}: ${result[runner]}`).join(
    '\n'
  )
}
