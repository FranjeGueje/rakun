import type {
  DMQueueElement,
  GameInfo,
  GameStatus,
  InstallParams,
  Runner,
  UpdateParams
} from 'common/types'
import type { ApiEvent } from '../client'
import { CliError } from '../client'
import { progressLine, statusLine } from '../format'
import { parseStore } from '../stores'
import { Command, Ctx, requireArg } from '../context'

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
  if (!game?.app_name)
    throw new CliError(`No hay ningún juego "${appName}" en ${runner}`)
  return game
}

export async function installParams(
  ctx: Ctx,
  appName: string,
  runner: Runner,
  path?: string
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
    platformToInstall: platformFor(gameInfo)
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
  throw new CliError('relicd cerró la conexión antes de terminar')
}

// relicd reports `done` even when a download failed: the queue keeps the truth
async function failedInQueue(ctx: Ctx, appName: string): Promise<boolean> {
  const { finished } = await ctx.api.call<{ finished: DMQueueElement[] }>(
    'getDMQueueInformation'
  )
  const last = finished.filter((e) => e.params.appName === appName).at(-1)
  return last?.status === 'error' || last?.status === 'abort'
}

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
  if (ending !== 'done') throw new CliError(`Terminó con estado "${ending}"`)
  if (queued && (await failedInQueue(ctx, appName))) {
    throw new CliError('La descarga ha fallado: mira los logs de relicd')
  }
}

function gameArgs(args: string[]): [Runner, string] {
  const { runner } = parseStore(requireArg(args, 0, 'tienda'))
  return [runner, requireArg(args, 1, 'appName')]
}

export const install: Command = async (ctx, args, opts) => {
  const [runner, appName] = gameArgs(args)
  const params = await installParams(ctx, appName, runner, opts.path)
  await run(
    ctx,
    appName,
    opts.wait,
    () => ctx.api.call('install', params),
    true
  )
}

export const update: Command = async (ctx, args, opts) => {
  const [runner, appName] = gameArgs(args)
  const gameInfo = await loadGame(ctx, appName, runner)
  const params: UpdateParams = { appName, runner, gameInfo }
  await run(
    ctx,
    appName,
    opts.wait,
    () => ctx.api.call('updateGame', params),
    true
  )
}

export const repair: Command = async (ctx, args, opts) => {
  const [runner, appName] = gameArgs(args)
  await run(ctx, appName, opts.wait, () =>
    ctx.api.call('repair', appName, runner)
  )
}

// Deletes the game's files and its settings: that is what uninstalling means
export const uninstall: Command = async (ctx, args, opts) => {
  const [runner, appName] = gameArgs(args)
  await run(ctx, appName, opts.wait, () =>
    ctx.api.call('uninstall', appName, runner, true, true)
  )
}
