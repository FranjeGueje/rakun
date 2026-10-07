import type { AppSettings } from 'common/types'
import { CliError } from '../client'
import { Command, Ctx, show } from '../context'

export function settingKey(
  settings: AppSettings,
  key: string
): keyof AppSettings {
  if (!(key in settings))
    throw new CliError(
      `Ajuste desconocido "${key}". Los que hay: ${Object.keys(settings).join(', ')}`
    )
  return key as keyof AppSettings
}

/** Turns the typed text into the type the setting already has */
export function parseValue(
  current: unknown,
  raw: string
): string | number | boolean {
  if (typeof current === 'boolean') {
    if (raw !== 'true' && raw !== 'false')
      throw new CliError('El valor debe ser true o false')
    return raw === 'true'
  }
  if (typeof current === 'number') {
    if (raw.trim() === '' || Number.isNaN(Number(raw)))
      throw new CliError('El valor debe ser un número')
    return Number(raw)
  }
  return raw
}

/** Read when rakun starts: saving it changes nothing until then */
const AT_START = new Set<keyof AppSettings>(['webAccess'])

const line = (key: string, value: unknown, note = '') =>
  `${key} = ${String(value)}${note}`

/** `maxWorkers` is only meaningful next to how many CPUs there are */
async function maxWorkersNote(ctx: Ctx, key: string) {
  if (key !== 'maxWorkers') return ''
  return ` (máx. ${await ctx.api.call<number>('getMaxCpus')})`
}

async function listLines(ctx: Ctx, settings: AppSettings) {
  const lines = []
  for (const [key, value] of Object.entries(settings))
    lines.push(line(key, value, await maxWorkersNote(ctx, key)))
  return lines.join('\n')
}

export const config: Command = async (ctx, args) => {
  const settings = await ctx.api.call<AppSettings>('requestAppSettings')
  if (!args[0])
    return ctx.log(
      ctx.json
        ? JSON.stringify(settings, null, 2)
        : await listLines(ctx, settings)
    )
  const key = settingKey(settings, args[0])
  if (args[1] === undefined) {
    const note = ctx.json ? '' : await maxWorkersNote(ctx, key)
    return show(ctx, settings[key], (value) => `${String(value)}${note}`)
  }
  const value = parseValue(settings[key], args[1])
  await ctx.api.call('setSetting', { key, value })
  ctx.log(
    line(key, value, AT_START.has(key) ? ' (se aplica al reiniciar rakun)' : '')
  )
}
