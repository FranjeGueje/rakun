import type { GameInfo, Runner } from 'common/types'
import type { ApiEvent } from '../client'
import { libraryText } from '../format'
import { STORES, parseStore, storeLabel } from '../stores'
import { Command, show } from '../context'

export const library: Command = async (ctx, args, opts) => {
  const runner = args[0] ? parseStore(args[0]).runner : 'all'
  const games = await ctx.api.call<GameInfo[]>('getLibrary', runner)
  const shown = opts.installed ? games.filter((g) => g.is_installed) : games
  show(ctx, shown, libraryText)
}

/** Resolves when every store in `pending` has reported its refresh */
async function waitForRefresh(
  events: AsyncGenerator<ApiEvent>,
  pending: Set<Runner>,
  log: (line: string) => void
): Promise<void> {
  for await (const { event, args } of events) {
    if (event !== 'refreshLibrary' || !pending.delete(args[0] as Runner)) {
      continue
    }
    log(`${storeLabel(args[0] as Runner)} actualizada`)
    if (!pending.size) return
  }
}

export const refresh: Command = async (ctx, args) => {
  const runners = args[0]
    ? [parseStore(args[0]).runner]
    : STORES.map((s) => s.runner)
  const events = await ctx.api.events()
  await ctx.api.call('refreshLibrary', args[0] ? runners[0] : 'all')
  await waitForRefresh(events, new Set(runners), ctx.log)
}
