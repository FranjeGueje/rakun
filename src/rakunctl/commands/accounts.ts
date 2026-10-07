import type { AccountsStatus, SessionsImport } from 'common/rakun/accounts'
import type { LoginInfo, LoginResult } from 'common/rakun/login'
import type { DMQueueElement } from 'common/types'
import { CliError } from '../client'
import { webLines } from '../web'
import { accountsText, sessionsImportText } from '../format'
import { parseStore } from '../stores'
import { Command, requireArg, show } from '../context'

export const status: Command = async (ctx) => {
  const health = await ctx.api.health()
  const accounts = await ctx.api.call<AccountsStatus>('getAccounts')
  const queue = await ctx.api.call<{ elements: DMQueueElement[] }>(
    'getDMQueueInformation'
  )
  const stores = await ctx.stores()
  const summary = {
    running: true,
    health,
    accounts,
    queue: queue.elements.length
  }
  show(ctx, summary, () =>
    [
      `rakun ${health.version}`,
      ...webLines(health.web, ctx.api.port),
      accountsText(accounts, stores),
      `Queue: ${queue.elements.length} pending`
    ].join('\n')
  )
}

export const login: Command = async (ctx, args) => {
  const { id: runner } = parseStore(
    await ctx.stores(),
    requireArg(args, 0, 'store')
  )
  const info = await ctx.api.call<LoginInfo>('getLoginInfo', runner)
  ctx.log(`${info.instructions}\n\n${info.url}\n`)
  const pasted = await ctx.ask('Paste the result here: ')
  const result = await ctx.api.call<LoginResult>('submitLogin', runner, pasted)
  if (!result.ok) throw new CliError(result.error ?? 'Login rejected')
  ctx.log('Logged in.')
}

export const logout: Command = async (ctx, args) => {
  const store = parseStore(await ctx.stores(), requireArg(args, 0, 'store'))
  await ctx.api.call('logout', store.id)
  ctx.log(`Logged out of ${store.label}.`)
}

export const importRelic: Command = async (ctx) => {
  const result = await ctx.api.call<SessionsImport>('importSessionsFromRelic')
  const stores = await ctx.stores()
  show(ctx, result, (value) => sessionsImportText(value, stores))
}
