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
      : `${what}: ${value} does not exist`

const rules: Partial<Record<keyof AppSettings, Rule>> = {
  language: (value: string) =>
    supportedLanguages.some((lang) => lang === value)
      ? undefined
      : `Unsupported language "${value}"`,
  maxWorkers: (value: number) =>
    Number.isInteger(value) && value >= 0 && value <= cpus().length
      ? undefined
      : `maxWorkers must be an integer between 0 and ${cpus().length}`,
  defaultInstallPath: (value: string) =>
    isAbsolute(value) ? undefined : 'The path must be absolute',
  protonPath: (value: string) =>
    value === '' || (isFolder(value) && existsSync(join(value, 'proton')))
      ? undefined
      : `${value} is not a Proton folder (the "proton" executable is missing)`,
  webAccess: (value: string) =>
    isWebAccess(value)
      ? undefined
      : `webAccess must be one of: ${WEB_ACCESS_MODES.join(', ')}`,
  altGogdlBin: emptyOrFile('altGogdlBin'),
  altLegendaryBin: emptyOrFile('altLegendaryBin'),
  altNileBin: emptyOrFile('altNileBin')
}

function checkType(key: string, value: unknown, current: AppSettings) {
  if (!(key in current)) throw new Error(`Unknown setting "${key}"`)
  const expected = typeof current[key as keyof AppSettings]
  if (typeof value !== expected)
    throw new Error(`${key} must be of type ${expected}`)
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
