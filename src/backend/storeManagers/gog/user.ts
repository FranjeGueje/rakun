import axios from 'axios'
import { existsSync, unlinkSync } from 'fs'
import { logError, logInfo, LogPrefix, logWarning } from 'backend/logger'
import { rakunVersion } from 'backend/constants/others'
import { GOGLoginData } from 'common/types'
import { configStore } from './stores'
import { isOnline } from '../../online_monitor'
import { GOGCredentials, UserData } from 'common/types/gog'
import { libraryManagerMap } from '../index'
import { clearCache } from 'backend/utils'
import { redactSecrets } from '../helper_output'
import { clearSessionExpired, markSessionExpired } from '../session_state'
import { gogdlAuthConfig } from './constants'

/**
 * Redacts secrets from gogdl's raw (non-JSON) output, such as a Python
 * traceback, which can echo the token URL including the client secret and the
 * authorization code.
 */
const redactAuthSecrets = redactSecrets

/** What gogdl hands out as credentials: the token and who it is for (anything else is not credentials) */
function isCredentials(value: unknown): value is GOGCredentials {
  const candidate = value as Partial<GOGCredentials> | null
  return (
    typeof candidate?.access_token === 'string' &&
    candidate.access_token !== '' &&
    candidate.user_id !== undefined
  )
}

/** gogdl writes this to stderr when it could not reach GOG to renew the token: no answer, not a refusal */
const COULD_NOT_REACH = 'Failed to refresh credentials'

function authLogSanitizer(line: string) {
  try {
    const output = JSON.parse(line)
    output.access_token = '<redacted>'
    output.session_id = '<redacted>'
    output.refresh_token = '<redacted>'
    output.user_id = '<redacted>'
    return JSON.stringify(output) + '\n'
  } catch {
    return line
  }
}

// `gogdl auth` spawns a process and may hit the network to refresh the token,
// and getCredentials() is called from ~18 places (library refresh, install,
// update, metadata lookups...). A single startup used to spawn it ~17 times in
// 75 seconds, several of them within the same second. Two guards fix that:
// concurrent callers share one in-flight call, and the result is reused for a
// short window afterwards.
const CREDENTIALS_TTL_MS = 60_000

let cachedCredentials: { value: GOGCredentials; expiresAt: number } | undefined
let credentialsInFlight: Promise<GOGCredentials | undefined> | undefined

export class GOGUser {
  static async login(
    code: string
    // TODO: Write types for this
  ): Promise<{
    status: 'done' | 'error'
    data?: UserData
  }> {
    logInfo('Logging using GOG credentials', LogPrefix.Gog)

    // Gets token from GOG basaed on authorization code
    const { stdout, stderr } = await libraryManagerMap['gog'].runRunnerCommand(
      ['auth', '--code', code],
      {
        abortId: 'gogdl-auth',
        logSanitizer: authLogSanitizer
      }
    )

    try {
      const data: GOGLoginData = JSON.parse(stdout.trim())
      // A login is a token: any JSON without one (a message, null, {}) is not one
      if (data?.error || !isCredentials(data)) {
        return { status: 'error' }
      }
    } catch (err) {
      // stderr matters more than stdout here: when gogdl dies (for example
      // because it cannot write auth.json) stdout is empty and the reason only
      // shows up in the traceback.
      logError(
        `GOG login failed to parse std output from gogdl. stdout: ${redactAuthSecrets(stdout.trim())}, ` +
          `stderr: ${redactAuthSecrets(stderr.trim())}, error ${redactAuthSecrets(String(err))}`,
        LogPrefix.Gog
      )
      return { status: 'error' }
    }
    logInfo('Login Successful', LogPrefix.Gog)
    GOGUser.invalidateCredentialsCache()
    configStore.set('isLoggedIn', true)
    const userDetails = await this.getUserDetails()
    return { status: 'done', data: userDetails }
  }

  public static async getUserDetails(): Promise<UserData | undefined> {
    if (!isOnline()) {
      logError('Unable to login information, Rakun offline', LogPrefix.Gog)
      return
    }
    logInfo('Checking if login is valid', LogPrefix.Gog)
    if (!this.isLoggedIn()) {
      logWarning('User is not logged in', LogPrefix.Gog)
      return
    }
    const user = await this.getCredentials()
    if (!user) {
      logError("No credentials, can't get login information", LogPrefix.Gog)
      return
    }
    const response = await axios
      .get(`https://users.gog.com/users/${user.user_id}`, {
        headers: {
          Authorization: `Bearer ${user.access_token}`,
          'User-Agent': `Rakun/${rakunVersion}`
        }
      })
      .catch((error) => {
        logError(['Error getting login information', error], LogPrefix.Gog)
      })

    if (!response) {
      return
    }

    const data: UserData = response.data

    configStore.set('userData', data)
    logInfo('Saved username to config file', LogPrefix.Gog)

    return data
  }
  /**
   * Loads user credentials from config
   * if needed refreshes token and returns new credentials
   * @returns user credentials
   */
  public static async getCredentials(): Promise<GOGCredentials | undefined> {
    if (!isOnline()) {
      logWarning('Unable to get credentials - app is offline', {
        prefix: LogPrefix.Gog
      })
      return
    }

    if (cachedCredentials && Date.now() < cachedCredentials.expiresAt) {
      return cachedCredentials.value
    }

    // Share one gogdl run between callers that ask at the same time
    credentialsInFlight ??= GOGUser.fetchCredentials().finally(() => {
      credentialsInFlight = undefined
    })

    return credentialsInFlight
  }

  private static async fetchCredentials(): Promise<GOGCredentials | undefined> {
    const { stdout, stderr } = await libraryManagerMap['gog'].runRunnerCommand(
      ['auth'],
      {
        abortId: 'gogdl-get-credentials',
        logSanitizer: authLogSanitizer
      }
    )
    const trimmed = stdout?.trim()
    if (!trimmed) {
      // gogdl did not even answer (it crashed, auth.json was being written,
      // it is not there): that says nothing about the session
      logWarning('gogdl auth returned empty output', LogPrefix.Gog)
      return undefined
    }
    try {
      const credentials: unknown = JSON.parse(trimmed)
      if (!isCredentials(credentials)) {
        // «null» is how gogdl says it could not renew the token. With «Failed
        // to refresh credentials» it never reached GOG (no network): that is
        // not a refusal and marks nothing
        logWarning(
          'gogdl auth gave no credentials - re-login may be required',
          LogPrefix.Gog
        )
        if (GOGUser.isLoggedIn() && !stderr?.includes(COULD_NOT_REACH))
          markSessionExpired('gog')
        return undefined
      }
      clearSessionExpired('gog')
      // Never hold credentials past the token's own lifetime. gogdl reports
      // `expires_in` as the token's total validity and we cannot tell when it
      // was issued, so the short TTL is what actually bounds this in practice
      // — the cap only matters if gogdl ever reports a very short-lived token.
      const ttl = Math.min(
        CREDENTIALS_TTL_MS,
        (credentials.expires_in ?? 0) * 1000
      )
      cachedCredentials = { value: credentials, expiresAt: Date.now() + ttl }
      return credentials
    } catch (error) {
      // The text of a parse error can carry a piece of what was parsed
      logError(
        ['Error getting GOG credentials:', redactAuthSecrets(String(error))],
        LogPrefix.Gog
      )
      return undefined
    }
  }

  /** Drop the cached credentials, so the next read runs `gogdl auth` again. */
  public static invalidateCredentialsCache() {
    cachedCredentials = undefined
  }

  public static logout() {
    GOGUser.invalidateCredentialsCache()
    clearCache('gog')
    configStore.clear()
    if (existsSync(gogdlAuthConfig)) {
      unlinkSync(gogdlAuthConfig)
    }
    logInfo('Logging user out', LogPrefix.Gog)
  }

  public static isLoggedIn() {
    return configStore.get_nodefault('isLoggedIn') || false
  }
}
