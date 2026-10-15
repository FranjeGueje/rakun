import { logInfo, LogPrefix } from 'backend/logger'
import type { LoginInfo, LoginResult } from 'common/rakun/login'
import {
  authorizeUrl,
  exchangeCode,
  matchesPending,
  newPendingLogin,
  parseCallback,
  type PendingLogin
} from './oauth'
import { ItchUser, loginErrorMessage } from './user'

// The state and the verifier of the login that was started, until its browser comes back
// (one at a time, like Amazon's: a second `getLoginInfo` replaces it)
let pending: PendingLogin | undefined

/** The login address to open, and what it takes to wait for the browser coming back */
export function startItchLogin(port: number): LoginInfo {
  pending = newPendingLogin(port)
  return {
    runner: 'itch',
    url: authorizeUrl(pending),
    instructions:
      'Log in to itch.io and authorize rakun. When the browser comes back to rakun the login finishes by itself. If it cannot (another machine), paste the full address it ends on. To also have the games of your collections, paste an API key with every permission instead (itch.io → Settings → API keys).',
    callback: true
  }
}

/**
 * The pending login if `state` is its own, and it is spent (a state works once).
 * Any other callback leaves it alone: a page that sends the browser here with a
 * made-up state must not be able to cancel the login of the user.
 */
function takePending(state: string | undefined): PendingLogin | undefined {
  if (!matchesPending(pending, state)) return undefined
  const login = pending
  pending = undefined
  return login
}

/** The browser came back with `code`: trades it and logs in */
export async function completeItchLogin(
  code: string,
  state: string | undefined
): Promise<void> {
  const login = takePending(state)
  if (!login)
    throw new Error(
      'This login is not the one rakun started, or it took too long: log in again'
    )
  const token = await exchangeCode(login, code)
  await ItchUser.login(token, true)
  logInfo('itch.io login completed with OAuth', LogPrefix.Itch)
}

/** The user refused, or the browser came back with an error: forget the login */
export function cancelItchLogin(state: string | undefined): void {
  takePending(state)
}

/** What the user pasted: the address the browser ended on, or an API key */
export async function loginFromPaste(
  code: string,
  pasted = code
): Promise<LoginResult> {
  try {
    const callback = parseCallback(pasted)
    if (callback) await completeItchLogin(code, callback.state)
    else await ItchUser.login(code)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: loginErrorMessage(error) }
  }
}
