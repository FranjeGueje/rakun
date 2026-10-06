import type { Runner } from 'common/types'

const ZOOM_CALLBACK = 'https://www.zoom-platform.com/'

/** What each store puts in the page the browser ends up on after logging in */
const URL_PARAM: Record<Runner, string> = {
  legendary: 'code',
  gog: 'code',
  nile: 'openid.oa2.authorization_code',
  zoom: 'li_token'
}

function fromJson(pasted: string): string | undefined {
  try {
    const parsed = JSON.parse(pasted) as { authorizationCode?: unknown }
    const code = parsed.authorizationCode
    return typeof code === 'string' && code ? code : undefined
  } catch {
    return undefined
  }
}

function fromUrl(pasted: string, param: string): string | undefined {
  try {
    return new URL(pasted).searchParams.get(param) || undefined
  } catch {
    return undefined
  }
}

/**
 * Extracts the login code from whatever the user pasted: the full address of
 * the final page, the JSON Epic shows (`authorizationCode`), or the bare code.
 * Zoom needs a URL with `li_token`, so for it a callback URL is returned.
 */
export function extractLoginCode(
  runner: Runner,
  pasted: string
): string | undefined {
  const input = pasted.trim()
  if (!input) return undefined

  const code = input.startsWith('{')
    ? fromJson(input)
    : (fromUrl(input, URL_PARAM[runner]) ??
      (/^[^\s/?&=]+$/.test(input) ? input : undefined))

  if (!code) return undefined
  if (runner !== 'zoom') return code
  return `${ZOOM_CALLBACK}?li_token=${encodeURIComponent(code)}`
}
