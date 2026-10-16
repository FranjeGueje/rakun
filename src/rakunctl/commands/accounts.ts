import type { AccountsCheck, AccountsStatus } from 'common/rakun/accounts'
import type { LoginInfo, LoginResult } from 'common/rakun/login'
import type { DMQueueElement, Runner } from 'common/types'
import { CliError } from '../client'
import { webLines } from '../web'
import { accountsText, loginText } from '../format'
import { parseStore } from '../stores'
import type { HelperInfo } from 'common/rakun/helpers'
import { helpersLine } from './helpers'
import { Command, requireArg, show, type Ctx } from '../context'

export const status: Command = async (ctx, _args, opts) => {
  const health = await ctx.api.health()
  const accounts = await ctx.api.call<AccountsStatus>('getAccounts')
  // --check also asks the stores over the network, so it takes longer
  const checked = opts.check
    ? await ctx.api.call<AccountsCheck>('checkAccounts')
    : undefined
  const queue = await ctx.api.call<{ elements: DMQueueElement[] }>(
    'getDMQueueInformation'
  )
  const stores = await ctx.stores()
  const helpers = await ctx.api.call<HelperInfo[]>('getHelpers')
  const summary = {
    running: true,
    health,
    accounts,
    ...(checked ? { checked } : {}),
    queue: queue.elements.length,
    helpers
  }
  show(ctx, summary, () =>
    [
      `rakun ${health.version}`,
      ...webLines(health.web, ctx.api.port),
      accountsText(accounts, stores, checked),
      `Queue: ${queue.elements.length} pending`,
      helpersLine(helpers)
    ].join('\n')
  )
}

const LOGIN_POLL_MS = 1500
/** How long `login` waits for the browser to come back before giving up */
const LOGIN_WAIT_MS = 5 * 60 * 1000

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })

const hasSession = async (ctx: Ctx, runner: Runner) =>
  (await ctx.api.call<AccountsStatus>('getAccounts'))[runner]?.loggedIn

/** Waits until the store has a session: the browser came back to rakun by itself */
async function waitForSession(ctx: Ctx, runner: Runner, signal: AbortSignal) {
  const deadline = Date.now() + LOGIN_WAIT_MS
  while (!signal.aborted && Date.now() < deadline) {
    if (await hasSession(ctx, runner)) return true
    await sleep(LOGIN_POLL_MS, signal)
  }
  return false
}

/**
 * What the user pastes, or nothing if the login finished by itself first. With
 * a session already there (a new login over it) there is no telling the
 * browser's one from the old one, so then only the paste counts.
 */
async function pasteOrWait(
  ctx: Ctx,
  runner: Runner
): Promise<string | undefined> {
  if (await hasSession(ctx, runner)) return ctx.ask('Paste the result here: ')
  const stop = new AbortController()
  const waited = waitForSession(ctx, runner, stop.signal).then((done) =>
    done
      ? undefined
      : Promise.reject(new CliError('Timed out waiting for the login'))
  )
  const asked = ctx.ask(
    'Waiting for the browser (way 1)... or paste the address, or the API key (way 2), here: ',
    stop.signal
  )
  try {
    return await Promise.race([waited, asked])
  } finally {
    stop.abort()
    waited.catch(() => undefined)
    asked.catch(() => undefined)
  }
}

export const login: Command = async (ctx, args) => {
  const { id: runner } = parseStore(
    await ctx.stores(),
    requireArg(args, 0, 'store')
  )
  const info = await ctx.api.call<LoginInfo>('getLoginInfo', runner)
  ctx.log(loginText(info))
  const pasted = info.callback
    ? await pasteOrWait(ctx, runner)
    : await ctx.ask('Paste the result here: ')
  if (pasted === undefined) return ctx.log('Logged in.')
  const result = await ctx.api.call<LoginResult>('submitLogin', runner, pasted)
  if (!result.ok) throw new CliError(result.error ?? 'Login rejected')
  ctx.log('Logged in.')
}

export const logout: Command = async (ctx, args) => {
  const store = parseStore(await ctx.stores(), requireArg(args, 0, 'store'))
  await ctx.api.call('logout', store.id)
  ctx.log(`Logged out of ${store.label}.`)
}
