import { Command, Ctx, Options } from '../context'
import { parseStore } from '../stores'

async function logArgs(
  ctx: Ctx,
  args: string[],
  type: Options['type']
): Promise<Record<string, string | undefined>> {
  if (!args[0]) return {}
  const { id: runner } = parseStore(await ctx.stores(), args[0])
  return args[1] ? { runner, appName: args[1], type } : { runner }
}

export const logs: Command = async (ctx, args, opts) => {
  const text = await ctx.api.call<string>(
    'getLogContent',
    await logArgs(ctx, args, opts.type)
  )
  ctx.log(text.trimEnd() || 'No log found')
}
