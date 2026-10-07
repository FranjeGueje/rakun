import { CliError } from '../client'
import { Command, requireArg } from '../context'

export function parseCallArgs(raw: string | undefined): unknown[] {
  if (raw === undefined) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new CliError('The arguments must be valid JSON: \'["gog"]\'')
  }
  if (!Array.isArray(parsed)) {
    throw new CliError('The arguments must be a JSON array')
  }
  return parsed as unknown[]
}

export const call: Command = async (ctx, args) => {
  const channel = requireArg(args, 0, 'canal')
  const result = await ctx.api.call(channel, ...parseCallArgs(args[1]))
  ctx.log(JSON.stringify(result, null, 2))
}

export const events: Command = async (ctx) => {
  for await (const { event, args } of await ctx.api.events()) {
    ctx.log(`${event} ${JSON.stringify(args)}`)
  }
  throw new CliError('rakun closed the connection')
}
