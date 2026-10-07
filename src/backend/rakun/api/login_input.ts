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
 */
export function extractLoginCode(
  urlParam: string,
  pasted: string
): string | undefined {
  const input = pasted.trim()
  if (!input) return undefined

  return input.startsWith('{')
    ? fromJson(input)
    : (fromUrl(input, urlParam) ??
        (/^[^\s/?&=]+$/.test(input) ? input : undefined))
}
