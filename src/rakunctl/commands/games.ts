import type {
  DMQueueElement,
  GameInfo,
  GameStatus,
  InstallParams,
  Runner,
  UpdateParams
} from 'common/types'
import type { UpdateableGame } from 'common/rakun/updates'
import type { ApiEvent } from '../client'
import { CliError } from '../client'
import { progressLine, statusLine } from '../format'
import { parseStore } from '../stores'
import { Command, Ctx, Options, requireArg } from '../context'

const FINAL_STATUSES = new Set(['done', 'error', 'canceled'])

// GOG and Zoom name platforms in lower case, Epic and Amazon capitalised
export function platformFor({ runner, is_linux_native }: GameInfo) {
  if (is_linux_native) return 'linux'
  return runner === 'gog' || runner === 'zoom' ? 'windows' : 'Windows'
}

async function loadGame(ctx: Ctx, appName: string, runner: Runner) {
  const game = await ctx.api.call<GameInfo | null>(
    'getGameInfo',
    appName,
    runner
  )
  // The stores answer an empty object for a game they don't know, Epic null
  if (!game?.app_name) throw new CliError(`No game "${appName}" in ${runner}`)
  return game
}

export async function installParams(
  ctx: Ctx,
  appName: string,
  runner: Runner,
  { path, lang, skipDlcs }: Pick<Options, 'path' | 'lang' | 'skipDlcs'>
): Promise<InstallParams> {
  const gameInfo = await loadGame(ctx, appName, runner)
  const settings = await ctx.api.call<{ defaultInstallPath: string }>(
    'requestAppSettings'
  )
  return {
    appName,
    runner,
    gameInfo,
    path: path ?? settings.defaultInstallPath,
    platformToInstall: platformFor(gameInfo),
    installLanguage: lang,
    // No list means every DLC; an empty one means none
    installDlcs: skipDlcs ? [] : undefined
  }
}

/** Prints what happens to one game and resolves with how it ended */
export async function followGame(
  ctx: Ctx,
  events: AsyncGenerator<ApiEvent>,
  appName: string
): Promise<string> {
  let lastPercent = -1
  for await (const { event, args } of events) {
    const update = args[0] as GameStatus
    if (update.appName !== appName) continue
    if (event === 'progressUpdate') {
      const percent = Math.floor(update.progress?.percent ?? -1)
      if (percent !== lastPercent) ctx.log(progressLine(update))
      lastPercent = percent
    } else if (event === 'gameStatusUpdate') {
      ctx.log(statusLine(update))
      if (FINAL_STATUSES.has(update.status)) return update.status
    }
  }
  throw new CliError('rakun closed the connection before finishing')
}

// rakun reports `done` even when a download failed: the queue keeps the truth
/** Why the last queue entry of the game failed ('' if no reason), or undefined if it did not fail */
async function failureInQueue(
  ctx: Ctx,
  appName: string
): Promise<string | undefined> {
  const { finished } = await ctx.api.call<{ finished: DMQueueElement[] }>(
    'getDMQueueInformation'
  )
  const last = finished.filter((e) => e.params.appName === appName).at(-1)
  if (last?.status !== 'error' && last?.status !== 'abort') return undefined
  return last.error ?? ''
}

export const failureMessage = (reason: string) =>
  `The download failed: ${reason || 'see the rakun logs'}`

/** Starts the work and, unless --no-wait, follows it until it ends */
async function run(
  ctx: Ctx,
  appName: string,
  wait: boolean,
  start: () => Promise<unknown>,
  queued = false
): Promise<void> {
  const events = wait ? await ctx.api.events() : undefined
  const started = start()
  if (!events) return void (await started)
  const [ending] = await Promise.all([
    followGame(ctx, events, appName),
    started
  ])
  if (ending !== 'done') throw new CliError(`Ended with status "${ending}"`)
  const failure = queued ? await failureInQueue(ctx, appName) : undefined
  if (failure !== undefined) throw new CliError(failureMessage(failure))
}

async function gameArgs(ctx: Ctx, args: string[]): Promise<[Runner, string]> {
  const store = parseStore(await ctx.stores(), requireArg(args, 0, 'store'))
  return [store.id, requireArg(args, 1, 'appName')]
}

export const install: Command = async (ctx, args, opts) => {
  const [runner, appName] = await gameArgs(ctx, args)
  const params = await installParams(ctx, appName, runner, opts)
  if (params.gameInfo.is_installed)
    throw new CliError(
      `${params.gameInfo.title} is already installed: use repair or update`
    )
  await run(
    ctx,
    appName,
    opts.wait,
    () => ctx.api.call('install', params),
    true
  )
}

async function updateGame(ctx: Ctx, gameInfo: GameInfo, wait: boolean) {
  const { app_name: appName, runner } = gameInfo
  const params: UpdateParams = { appName, runner, gameInfo }
  await run(ctx, appName, wait, () => ctx.api.call('updateGame', params), true)
}

/** The installed games with a newer version, of one store or of all, that are not already queued */
export async function pendingUpdates(
  ctx: Ctx,
  runner?: Runner
): Promise<UpdateableGame[]> {
  const updateable = await ctx.api.call<UpdateableGame[]>('getUpdateableGames')
  const { elements } = await ctx.api.call<{ elements: DMQueueElement[] }>(
    'getDMQueueInformation'
  )
  const queued = new Set(elements.map((element) => element.params.appName))
  return updateable.filter(
    (game) => (!runner || game.runner === runner) && !queued.has(game.appName)
  )
}

/** One at a time (the queue is sequential anyway); a failure does not stop the rest */
async function updateAll(ctx: Ctx, runner: Runner | undefined, wait: boolean) {
  const pending = await pendingUpdates(ctx, runner)
  if (!pending.length) return ctx.log('Everything is up to date')
  const failures: string[] = []
  for (const [index, { appName, runner: owner }] of pending.entries()) {
    try {
      const game = await loadGame(ctx, appName, owner)
      ctx.log(`Updating ${game.title} (${index + 1}/${pending.length})`)
      await updateGame(ctx, game, wait)
    } catch (error) {
      failures.push(`${appName}: ${(error as Error).message}`)
    }
  }
  if (failures.length)
    throw new CliError(
      `${failures.length} of ${pending.length} failed:\n- ${failures.join('\n- ')}`
    )
}

/** `update`: one game, every game of a store, or every game with an update */
export const update: Command = async (ctx, args, opts) => {
  if (args[1]) {
    const [runner, appName] = await gameArgs(ctx, args)
    return updateGame(ctx, await loadGame(ctx, appName, runner), opts.wait)
  }
  const runner = args[0]
    ? parseStore(await ctx.stores(), args[0]).id
    : undefined
  await updateAll(ctx, runner, opts.wait)
}

export const repair: Command = async (ctx, args, opts) => {
  const [runner, appName] = await gameArgs(ctx, args)
  await run(ctx, appName, opts.wait, () =>
    ctx.api.call('repair', appName, runner)
  )
}

// Deletes the game's files: that is what uninstalling means
export const uninstall: Command = async (ctx, args, opts) => {
  const [runner, appName] = await gameArgs(ctx, args)
  await run(ctx, appName, opts.wait, () =>
    ctx.api.call('uninstall', appName, runner, true)
  )
}
