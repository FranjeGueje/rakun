/** Who can open relicd's web (see `webAccess` in API.md) */
export const WEB_ACCESS_MODES = ['local', 'network', 'off'] as const

export type WebAccess = (typeof WEB_ACCESS_MODES)[number]

export const isWebAccess = (value: unknown): value is WebAccess =>
  WEB_ACCESS_MODES.some((mode) => mode === value)
