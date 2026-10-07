import { CliError } from '../client'
import { Command, Ctx, Options } from '../context'
import { parseStore } from '../stores'

async function storeToClear(ctx: Ctx, name: string | undefined) {
  return name ? (parseStore(await ctx.stores(), name).id as string) : undefined
}

export const cache: Command = async (ctx, args) => {
  if (args[0] !== 'clear')
    throw new CliError('Uso: rakunctl cache clear [tienda]')
  const library = await storeToClear(ctx, args[1])
  await ctx.api.call('clearCache', ...(library ? [library] : []))
  ctx.log('Caché vaciada')
}

async function confirmed(ctx: Ctx, opts: Options) {
  if (opts.yes) return true
  const answer = await ctx.ask(
    'Esto borra sesiones, ajustes y cola (no los juegos instalados). ¿Seguro? [s/N] '
  )
  return /^(s|si|sí|y|yes)$/i.test(answer.trim())
}

export const reset: Command = async (ctx, _args, opts) => {
  if (!(await confirmed(ctx, opts))) return ctx.log('Cancelado')
  await ctx.api.call('resetRakun')
  ctx.log('rakun restablecido y detenido; arráncalo de nuevo')
}
