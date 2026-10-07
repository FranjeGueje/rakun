import type { Runner } from 'common/types'
import type { LoginResult } from 'common/relic/login'
import { addHandler } from 'backend/ipc'
import { logError, LogPrefix } from 'backend/logger'
import { stores } from 'backend/storeManagers'
import { extractLoginCode } from './login_input'
import { startRefresh } from './refresh'

async function submitLogin(
  runner: Runner,
  pasted: string
): Promise<LoginResult> {
  const { login } = stores[runner]
  const code = extractLoginCode(login.urlParam, pasted)
  if (!code) {
    return { ok: false, error: 'No login code found in what was pasted' }
  }

  try {
    const result = await login.submit(code)
    if (!result.ok) return result
  } catch (error) {
    logError([`Login to ${runner} failed:`, error], LogPrefix.Backend)
    return { ok: false, error: String(error) }
  }

  startRefresh(runner)
  return { ok: true }
}

addHandler('getLoginInfo', (_e, runner) => stores[runner].login.start())
addHandler('submitLogin', (_e, runner, pasted) => submitLogin(runner, pasted))
