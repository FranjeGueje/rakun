import {
  LogPrefix,
  logDebug,
  logError,
  logInfo,
  logWarning
} from 'backend/logger'
import {
  NileLoginData,
  NileRegisterData,
  NileUserData
} from 'common/types/nile'
import { libraryManagerMap } from '..'
import { existsSync, readFileSync } from 'fs'
import { configStore } from './electronStores'
import { clearCache } from 'backend/utils'
import { nileUserData } from './constants'
import { exitFailure } from '../helper_result'

function authLogSanitizer(line: string) {
  try {
    const output = JSON.parse(line)
    output.url = '<redacted>'
    output.code_verifier = '<redacted>'
    output.serial = '<redacted>'
    output.client_id = '<redacted>'
    return JSON.stringify(output) + '\n'
  } catch {
    return line
  }
}

export class NileUser {
  static async getLoginData(): Promise<NileLoginData> {
    logDebug('Getting login data from Nile', LogPrefix.Nile)
    const { stdout } = await libraryManagerMap['nile'].runRunnerCommand(
      ['auth', '--login', '--non-interactive'],
      {
        abortId: 'nile-auth',
        logSanitizer: authLogSanitizer
      }
    )
    if (!stdout?.trim()) {
      throw Error('Empty response from nile auth command')
    }
    const output: NileLoginData = JSON.parse(stdout)

    return output
  }

  static async login(
    data: NileRegisterData
  ): Promise<{ status: 'done' | 'failed'; user: NileUserData | undefined }> {
    const { code, code_verifier, serial, client_id } = data
    // Nile prints output to stderr
    const result = await libraryManagerMap['nile'].runRunnerCommand(
      [
        'register',
        '--code',
        code,
        '--code-verifier',
        code_verifier,
        '--serial',
        serial,
        '--client-id',
        client_id
      ],
      { abortId: 'nile-login' }
    )
    const output = result.stderr

    // nile spells it «Succesfully»; the fixed spelling must not break every login
    const successRegex =
      /\[AUTH_MANAGER]:.*Succe(?:s)?sfully registered a device/
    if (!successRegex.test(output) || exitFailure(result)) {
      // Authentication failed
      // What was sent can come back in nile's own words: it is not logged
      const secrets = [code, code_verifier, serial, client_id].filter(Boolean)
      const safe = secrets.reduce(
        (text, secret) => text.split(secret).join('<redacted>'),
        output
      )
      logError(['Authentication failed:', safe], LogPrefix.Nile)
      return {
        status: 'failed',
        user: undefined
      }
    }

    logInfo('Authentication successful', LogPrefix.Nile)
    const user = this.getUserData()
    if (!user) {
      return {
        status: 'failed',
        user: undefined
      }
    }

    return {
      status: 'done',
      user
    }
  }

  static async logout() {
    const commandParts = ['auth', '--logout']

    const res = await libraryManagerMap['nile'].runRunnerCommand(commandParts, {
      abortId: 'nile-logout'
    })

    if (res.abort || res.error) {
      const reason = res.error ?? 'abort by user'
      logError(['Failed to logout:', reason], LogPrefix.Nile)
      // nile's session file is still there, and account() reads it back: the
      // client must not be told it is out
      throw new Error(`Could not log out of Amazon: ${reason}`)
    }

    configStore.delete('userData')
    clearCache('nile')
  }

  static getUserData(): NileUserData | undefined {
    if (!existsSync(nileUserData)) {
      // Normal when nobody is logged in, and getAccounts asks every time
      logDebug('No current_user.json: not logged in', LogPrefix.Nile)
      configStore.delete('userData')
      return
    }

    let user: NileUserData | null
    try {
      user = JSON.parse(readFileSync(nileUserData, 'utf-8'))
    } catch (error) {
      // Cannot read it (cut short, being written): that does not log anybody
      // out, and getAccounts asks for every store through here
      logWarning(['current_user.json is unreadable:', error], LogPrefix.Nile)
      return configStore.get_nodefault('userData')
    }
    if (!user || !Object.keys(user).length) {
      logInfo('user.json is empty', LogPrefix.Nile)
      configStore.delete('userData')
      return
    }

    configStore.set('userData', user)
    logDebug('Saved user data to config file', LogPrefix.Nile)

    return user
  }

  public static isLoggedIn() {
    return configStore.get_nodefault('userData') || false
  }
}
