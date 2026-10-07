import type { AppSettings } from 'common/types'
import { CliError } from '../client'
import { Command, show } from '../context'

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

const line = (key: string, value: unknown) => `${key} = ${String(value)}`

export const config: Command = async (ctx, args) => {
  const settings = await ctx.api.call<AppSettings>('requestAppSettings')
  if (!args[0])
    return show(ctx, settings, (all) =>
      Object.entries(all)
        .map(([key, value]) => line(key, value))
        .join('\n')
    )
  const key = settingKey(settings, args[0])
  if (args[1] === undefined)
    return show(ctx, settings[key], (value) => String(value))
  const value = parseValue(settings[key], args[1])
  await ctx.api.call('setSetting', { key, value })
  ctx.log(line(key, value))
}
