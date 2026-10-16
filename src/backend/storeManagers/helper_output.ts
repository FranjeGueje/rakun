import { logWarning, LogPrefix } from 'backend/logger'

/** Hides what a text can carry that must not reach a log: tokens in a URL or in JSON */
export function redactSecrets(text: string): string {
  return text
    .replace(
      /((?:client_secret|code|refresh_token|access_token)=)[^&\s"']+/gi,
      '$1<redacted>'
    )
    .replace(
      /("(?:access_token|refresh_token|session_id|user_id|token)"\s*:\s*")[^"]*"/gi,
      '$1<redacted>"'
    )
}

const SAMPLE_LENGTH = 160

/**
 * A helper answered, and not in the shape rakun reads (a new version of it
 * changed its output). Says which helper and command, and what it looked like.
 */
export class HelperOutputError extends Error {
  constructor(
    readonly helper: string,
    readonly command: string,
    reason: string,
    text: string
  ) {
    super(
      `${helper} ${command}: not the output rakun knows (${reason}): ${redactSecrets(text).trim().slice(0, SAMPLE_LENGTH)}`
    )
  }
}

// One line in the log per helper and command: a list that is read every minute must not fill it
const unrecognized = new Map<string, string>()

/** Remembers, and logs the first time, that a helper gave an output rakun does not know */
export function markHelperOutputUnrecognized(error: HelperOutputError) {
  const key = `${error.helper} ${error.command}`
  if (unrecognized.has(key)) return
  unrecognized.set(key, error.message)
  logWarning(
    [error.message, '(a newer version of the helper?)'],
    LogPrefix.Backend
  )
}

/** What the helpers said that rakun did not understand */
export const helperOutputWarnings = (): string[] => [...unrecognized.values()]

/** What this one helper said that rakun did not understand, to show next to its version */
export const helperOutputWarningOf = (helper: string): string | undefined => {
  const found = [...unrecognized.entries()].filter(([key]) =>
    key.startsWith(`${helper} `)
  )
  return found.length
    ? found.map(([, message]) => message).join('; ')
    : undefined
}

/** A helper has been understood again: what it said before is no longer a warning */
export const clearHelperOutputWarning = (helper: string, command: string) =>
  unrecognized.delete(`${helper} ${command}`)

/**
 * The JSON a helper printed, in the shape `isValid` checks (only the parts
 * rakun reads). Anything else throws HelperOutputError, instead of a
 * TypeError somewhere later or, worse, an empty answer taken for «nothing».
 */
export function parseHelperJson<T>(
  helper: string,
  command: string,
  text: string,
  isValid: (value: unknown) => value is T
): T {
  const fail = (reason: string) => {
    const error = new HelperOutputError(helper, command, reason, text)
    markHelperOutputUnrecognized(error)
    return error
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw fail('it is not JSON')
  }
  if (!isValid(value)) throw fail('it has another shape')
  clearHelperOutputWarning(helper, command)
  return value
}
