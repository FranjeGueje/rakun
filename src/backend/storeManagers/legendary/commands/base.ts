import { Brand, isPath, Path, schema } from 'backend/schemas'

export type LegendaryAppName = Brand<string, 'LegendaryAppName'>
export const LegendaryAppName = schema<LegendaryAppName>(
  'LegendaryAppName',
  (value) => typeof value === 'string'
)

const PLATFORMS = ['Win32', 'Windows', 'Mac'] as const
export type LegendaryPlatform = (typeof PLATFORMS)[number]
export const LegendaryPlatform = schema<LegendaryPlatform>(
  'LegendaryPlatform',
  (value) => PLATFORMS.some((platform) => platform === value)
)

export type NonEmptyString = Brand<string, 'NonEmptyString'>
export const NonEmptyString = schema<NonEmptyString>(
  'NonEmptyString',
  (value) => typeof value === 'string' && value.length > 0
)

export type PositiveInteger = Brand<number, 'PositiveInteger'>
export const PositiveInteger = schema<PositiveInteger>(
  'PositiveInteger',
  (value) => Number.isInteger(value) && (value as number) > 0
)

// `URL` is also the name of the type below, so the global one is asked by name
const isUrl = (value: unknown): boolean =>
  typeof value === 'string' && globalThis.URL.canParse(value)

export type URL = Brand<string, 'URL'>
export const URL = schema<URL>('URL', isUrl)

// A manifest is either a file or a URL
export type URI = Path | URL
export const URI = schema<URI>('URI', (value) => isUrl(value) || isPath(value))
