import { existsSync, readFileSync } from 'fs'

import { UserInfo } from 'common/types'
import { clearCache } from '../../utils'
import { logError, LogPrefix } from 'backend/logger'
import { userInfo as user } from 'os'
import { libraryManagerMap } from '..'
import { LegendaryCommand } from './commands'
import { NonEmptyString } from './commands/base'
import { legendaryUserInfo } from './constants'
import { exitFailure } from '../helper_result'

export class LegendaryUser {
  public static async login(
    authorizationCode: string
  ): Promise<{ status: 'done' | 'failed'; data: UserInfo | undefined }> {
    const command: LegendaryCommand = {
      subcommand: 'auth',
      '--code': NonEmptyString.parse(authorizationCode)
    }

    const errorMessage = (
      error: string
    ): { status: 'failed'; data: undefined } => {
      logError(['Failed to login with Legendary:', error], LogPrefix.Legendary)

      return { status: 'failed', data: undefined }
    }

    try {
      const res = await libraryManagerMap['legendary'].runRunnerCommand(
        command,
        {
          abortId: 'legendary-login',
          logMessagePrefix: 'Logging in'
        }
      )

      if (res.stderr.includes('ERROR: Logging in ')) {
        return errorMessage(res.stderr)
      }

      res.error ??= exitFailure(res)
      if (res.error || res.abort) {
        return errorMessage(res.error ?? 'abort by user')
      }

      // A login is a session: if legendary left no user.json (or kept an old
      // one that is not this login's), nobody is logged in whatever it said
      const userInfo = this.getUserInfo()
      if (!userInfo) return errorMessage('legendary saved no session')
      return { status: 'done', data: userInfo }
    } catch (error) {
      return errorMessage(`${String(error)}`)
    }
  }

  public static async logout() {
    const command: LegendaryCommand = { subcommand: 'auth', '--delete': true }

    const res = await libraryManagerMap['legendary'].runRunnerCommand(command, {
      abortId: 'legendary-logout',
      logMessagePrefix: 'Logging out'
    })

    if (res.error || res.abort) {
      const reason = res.error ?? 'abort by user'
      logError(['Failed to logout:', reason], LogPrefix.Legendary)
      // The session file is still there: do not tell the client it is out
      throw new Error(`Could not log out of Epic: ${reason}`)
    }

    clearCache('legendary')
  }

  public static isLoggedIn() {
    return existsSync(legendaryUserInfo)
  }

  public static getUserInfo(): UserInfo | undefined {
    if (!LegendaryUser.isLoggedIn()) {
      return
    }
    try {
      const userInfoContent = readFileSync(legendaryUserInfo).toString()
      const userInfoObject = JSON.parse(userInfoContent)
      const info: UserInfo = {
        account_id: userInfoObject.account_id,
        displayName: userInfoObject.displayName,
        user: user().username
      }
      return info
    } catch (error) {
      logError(
        [`User info file corrupted, check ${legendaryUserInfo}. Error:`, error],
        LogPrefix.Legendary
      )
      return
    }
  }
}
