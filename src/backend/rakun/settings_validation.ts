import { existsSync, statSync } from 'fs'
import { cpus } from 'os'
import { isAbsolute, join } from 'path'
import { supportedLanguages } from 'common/languages'
import { isWebAccess, WEB_ACCESS_MODES } from 'common/rakun/web'
import type { AppSettings } from 'common/types'

type Rule = (value: never) => string | undefined

const isFolder = (path: string) =>
  existsSync(path) && statSync(path).isDirectory()

const emptyOrFile =
  (what: string): Rule =>
  (value: string) =>
    value === '' || existsSync(value)
      ? undefined
      : `${what}: no existe ${value}`

const rules: Partial<Record<keyof AppSettings, Rule>> = {
  language: (value: string) =>
    supportedLanguages.some((lang) => lang === value)
      ? undefined
      : `Idioma no soportado "${value}"`,
  maxWorkers: (value: number) =>
    Number.isInteger(value) && value >= 0 && value <= cpus().length
      ? undefined
      : `maxWorkers debe ser un entero entre 0 y ${cpus().length}`,
  defaultInstallPath: (value: string) =>
    isAbsolute(value) ? undefined : 'La ruta debe ser absoluta',
  protonPath: (value: string) =>
    value === '' || (isFolder(value) && existsSync(join(value, 'proton')))
      ? undefined
      : `${value} no es una carpeta de Proton (falta el ejecutable "proton")`,
  webAccess: (value: string) =>
    isWebAccess(value)
      ? undefined
      : `webAccess debe ser uno de: ${WEB_ACCESS_MODES.join(', ')}`,
  altGogdlBin: emptyOrFile('altGogdlBin'),
  altLegendaryBin: emptyOrFile('altLegendaryBin'),
  altNileBin: emptyOrFile('altNileBin')
}

function checkType(key: string, value: unknown, current: AppSettings) {
  if (!(key in current)) throw new Error(`Ajuste desconocido "${key}"`)
  const expected = typeof current[key as keyof AppSettings]
  if (typeof value !== expected)
    throw new Error(`${key} debe ser de tipo ${expected}`)
}

/** Throws with a readable message when the value is not valid for the setting */
export function validateSetting(
  key: string,
  value: unknown,
  current: AppSettings
) {
  checkType(key, value, current)
  const problem = rules[key as keyof AppSettings]?.(value as never)
  if (problem) throw new Error(problem)
}

export function validateSettings(
  config: Partial<AppSettings>,
  current: AppSettings
) {
  for (const [key, value] of Object.entries(config))
    validateSetting(key, value, current)
}
