import {
  HELPERS_DONE,
  type HelperInfo,
  type HelpersUpdate
} from 'common/rakun/helpers'
import { CliError } from '../client'
import { table } from '../format'
import { Command, Ctx, Options, show } from '../context'

const HINT = 'run "rakunctl helpers update"'

export function helpersText(helpers: HelperInfo[]): string {
  return table([
    ['HELPER', 'PINNED', 'INSTALLED', 'STATE'],
    ...helpers.map(({ helper, pinned, installed, state }) => [
      helper,
      pinned,
      installed || '-',
      state
    ])
  ])
}

/** The line `status` shows: what is missing or is not the tested version, and what to do about it */
export function helpersLine(helpers: HelperInfo[]): string {
  const missing = helpers
    .filter(({ state }) => state === 'missing')
    .map(({ helper }) => helper)
  const other = helpers
    .filter(({ state }) => state === 'other')
    .map(
      ({ helper, installed, pinned }) =>
        `${helper} is ${installed || 'another version'}, not the tested ${pinned}`
    )
  const problems = [
    ...(missing.length ? [`missing ${missing.join(', ')}`] : []),
    ...other
  ]
  return problems.length
    ? `Helpers: ${problems.join('; ')} (${HINT})`
    : 'Helpers: all installed'
}

/** Prints what rakun says while it downloads, until it says it is done */
async function followProgress(
  ctx: Ctx,
  events: AsyncGenerator<{ event: string; args: unknown[] }>
) {
  for await (const { event, args } of events) {
    if (event !== 'helpersProgress') continue
    if (args[0] === HELPERS_DONE) return
    ctx.log(String(args[0]))
  }
}

async function update(ctx: Ctx, { latest }: Pick<Options, 'latest'>) {
  const events = await ctx.api.events()
  const [, result] = await Promise.all([
    followProgress(ctx, events),
    ctx.api.call<HelpersUpdate>('updateHelpers', { latest: !!latest })
  ])
  ctx.log(helpersText(result.helpers))
  if (result.failures.length)
    throw new CliError(
      `${result.failures.length} of the helpers could not be installed:\n- ${result.failures
        .map(({ helper, error }) => `${helper}: ${error}`)
        .join('\n- ')}`
    )
}

/** `helpers`: what is installed. `helpers update`: downloads what is missing (`--latest`: the newest of all) */
export const helpers: Command = async (ctx, args, opts) => {
  if (args[0] === 'update') return update(ctx, opts)
  if (args[0])
    throw new CliError(
      `Unknown helpers command "${args[0]}": use "helpers" or "helpers update"`
    )
  const list = await ctx.api.call<HelperInfo[]>('getHelpers')
  show(ctx, list, helpersText)
}
