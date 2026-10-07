import type { AccountsStatus, SessionsImport } from 'common/relic/accounts'
import type { LoginInfo, LoginResult } from 'common/relic/login'
import type { DMQueueElement } from 'common/types'
import { CliError } from '../client'
import { accountsText, sessionsImportText } from '../format'
import { parseStore } from '../stores'
import { Command, requireArg, show } from '../context'

export const status: Command = async (ctx) => {
  const health = await ctx.api.health()
  const accounts = await ctx.api.call<AccountsStatus>('getAccounts')
  const queue = await ctx.api.call<{ elements: DMQueueElement[] }>(
    'getDMQueueInformation'
  )
  const summary = { health, accounts, queue: queue.elements.length }
  show(ctx, summary, () =>
    [
      `relicd ${health.version}`,
      accountsText(accounts),
      `Cola: ${queue.elements.length} pendientes`
    ].join('\n')
  )
}

export const login: Command = async (ctx, args) => {
  const { runner } = parseStore(requireArg(args, 0, 'tienda'))
  const info = await ctx.api.call<LoginInfo>('getLoginInfo', runner)
  ctx.log(`${info.instructions}\n\n${info.url}\n`)
  const pasted = await ctx.ask('Pega aquí el resultado: ')
  const result = await ctx.api.call<LoginResult>('submitLogin', runner, pasted)
  if (!result.ok) throw new CliError(result.error ?? 'Login rechazado')
  ctx.log('Sesión iniciada.')
}

export const logout: Command = async (ctx, args) => {
  const store = parseStore(requireArg(args, 0, 'tienda'))
  await ctx.api.call('logout', store.runner)
  ctx.log(`Sesión de ${store.label} cerrada.`)
}

export const importRelic: Command = async (ctx) => {
  const result = await ctx.api.call<SessionsImport>('importSessionsFromRelic')
  show(ctx, result, sessionsImportText)
}
