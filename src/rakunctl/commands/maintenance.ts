import { CliError } from '../client'
import { Command, Ctx, Options } from '../context'
import { parseStore } from '../stores'

async function storeToClear(ctx: Ctx, name: string | undefined) {
  return name ? (parseStore(await ctx.stores(), name).id as string) : undefined
}

export const cache: Command = async (ctx, args) => {
  if (args[0] !== 'clear')
    throw new CliError('Usage: rakunctl cache clear [store]')
  const library = await storeToClear(ctx, args[1])
  await ctx.api.call('clearCache', ...(library ? [library] : []))
  ctx.log('Cache cleared')
}

async function confirmed(ctx: Ctx, opts: Options) {
  if (opts.yes) return true
  const answer = await ctx.ask(
    'This deletes sessions, settings and the queue (not installed games). Continue? [y/N] '
  )
  return /^(y|yes)$/i.test(answer.trim())
}

export const reset: Command = async (ctx, _args, opts) => {
  if (!(await confirmed(ctx, opts))) return ctx.log('Canceled')
  await ctx.api.call('resetRakun')
  ctx.log('rakun was reset and stopped; start it again')
}
