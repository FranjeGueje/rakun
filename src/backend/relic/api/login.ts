import type { Runner } from 'common/types'
import type { LoginInfo, LoginResult } from 'common/relic/login'
import type { NileLoginData } from 'common/types/nile'
import { addHandler } from 'backend/ipc'
import { logError, LogPrefix } from 'backend/logger'
import { libraryManagerMap } from 'backend/storeManagers'
import { LegendaryUser } from 'backend/storeManagers/legendary/user'
import { GOGUser } from 'backend/storeManagers/gog/user'
import { NileUser } from 'backend/storeManagers/nile/user'
import { ZoomUser } from 'backend/storeManagers/zoom/user'
import { epicLoginUrl } from 'backend/constants/urls'
import { extractLoginCode } from './login_input'

const gogLoginUrl =
  'https://auth.gog.com/auth?client_id=46899977096215655&redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient&response_type=code&layout=galaxy'
const zoomLoginUrl =
  'https://www.zoom-platform.com/login?li=relic&return_li_token=true'

// Amazon hands out a one-time verifier together with the login URL; it has to
// be remembered until the user comes back with the code
let pendingAmazonLogin: NileLoginData | undefined

async function getLoginInfo(runner: Runner): Promise<LoginInfo> {
  switch (runner) {
    case 'legendary':
      return {
        runner,
        url: epicLoginUrl,
        instructions:
          'Log in to Epic. The page that follows shows a JSON: paste it (or just its "authorizationCode").'
      }
    case 'gog':
      return {
        runner,
        url: gogLoginUrl,
        instructions:
          'Log in to GOG. The browser ends on an embed.gog.com address (it can look blank): paste that full address.'
      }
    case 'nile':
      pendingAmazonLogin = await NileUser.getLoginData()
      return {
        runner,
        url: pendingAmazonLogin.url,
        instructions:
          'Log in to Amazon. Paste the full address of the page the browser ends on.'
      }
    case 'zoom':
      return {
        runner,
        url: zoomLoginUrl,
        instructions:
          'Log in to Zoom. Paste the full address of the page the browser ends on.'
      }
  }
}

async function loginWithCode(runner: Runner, code: string): Promise<boolean> {
  switch (runner) {
    case 'legendary':
      return (await LegendaryUser.login(code)).status === 'done'
    case 'gog':
      return (await GOGUser.login(code)).status === 'done'
    case 'nile': {
      if (!pendingAmazonLogin) return false
      const { code_verifier, serial, client_id } = pendingAmazonLogin
      const result = await NileUser.login({
        code,
        code_verifier,
        serial,
        client_id
      })
      pendingAmazonLogin = undefined
      return result.status === 'done'
    }
    case 'zoom': {
      const done = ZoomUser.login(code).status === 'done'
      if (done) await ZoomUser.getUserDetails()
      return done
    }
  }
}

async function submitLogin(
  runner: Runner,
  pasted: string
): Promise<LoginResult> {
  const code = extractLoginCode(runner, pasted)
  if (!code)
    return { ok: false, error: 'No login code found in what was pasted' }

  if (runner === 'nile' && !pendingAmazonLogin) {
    return { ok: false, error: 'Request the Amazon login (getLoginInfo) first' }
  }

  try {
    if (!(await loginWithCode(runner, code))) {
      return { ok: false, error: 'The store rejected the login' }
    }
  } catch (error) {
    logError([`Login to ${runner} failed:`, error], LogPrefix.Backend)
    return { ok: false, error: String(error) }
  }

  void libraryManagerMap[runner].refresh()
  return { ok: true }
}

addHandler('getLoginInfo', (_e, runner) => getLoginInfo(runner))
addHandler('submitLogin', (_e, runner, pasted) => submitLogin(runner, pasted))
