import { logError, logInfo, LogPrefix } from 'backend/logger'
import type { ItchUser as ItchUserData } from 'common/types/itch'
import { ButlerdError, isAuthRefusal } from './butlerd'
import { getButlerd } from './client'
import { configStore } from './electronStores'
import { clearCache } from '../../utils'
import { revokeToken } from './oauth'

type LoginResult = { profile: { id: number; user: ItchUserData } }

/** A token that lacks a permission cannot read the library (the key `butler login` makes is one) */
export function loginErrorMessage(error: unknown): string {
  if (error instanceof ButlerdError && /does not permit/.test(error.message))
    return 'That key or token does not have the permissions rakun needs: log in again with `rakunctl login itch`'
  return error instanceof Error ? error.message : String(error)
}

export class ItchUser {
  /**
   * Gives butler the key or token; it keeps it in its own database. An OAuth
   * `token` is also kept here, only to revoke it when the user logs out.
   */
  static async login(apiKey: string, oauth = false): Promise<void> {
    const butlerd = await getButlerd()
    const { profile } = await butlerd.call<LoginResult>(
      'Profile.LoginWithAPIKey',
      { apiKey }
    )
    configStore.set('profileId', profile.id)
    configStore.set('user', profile.user)
    if (oauth) configStore.set('oauthToken', apiKey)
    else configStore.delete('oauthToken')
    logInfo(`Logged in as ${profile.user.username}`, LogPrefix.Itch)
  }

  /**
   * Asks itch.io through butler if the saved login still works: true, false
   * (refused), or nothing when it could not be told. UseSavedLogin alone does
   * not ask itch.io (it answers from butler's database, also with no network),
   * so a page of the keys is asked fresh, which has to go to the server.
   */
  static async check(): Promise<boolean | undefined> {
    const profileId = configStore.get_nodefault('profileId')
    if (profileId === undefined) return false
    try {
      const butlerd = await getButlerd()
      await butlerd.call('Profile.UseSavedLogin', { profileId })
      await butlerd.call('Fetch.ProfileOwnedKeys', { profileId, fresh: true })
      return true
    } catch (error) {
      return isAuthRefusal(error) ? false : undefined
    }
  }

  static async logout(): Promise<void> {
    const profileId = configStore.get_nodefault('profileId')
    if (profileId !== undefined) {
      try {
        await (await getButlerd()).call('Profile.Forget', { profileId })
      } catch (error) {
        logError(['Profile.Forget failed:', error], LogPrefix.Itch)
      }
    }
    await ItchUser.revoke()
    configStore.delete('profileId')
    configStore.delete('user')
    clearCache('itch')
  }

  /** Makes itch.io drop the token of an OAuth login; failing to is logged, not an error */
  private static async revoke(): Promise<void> {
    const token = configStore.get_nodefault('oauthToken')
    configStore.delete('oauthToken')
    if (!token) return
    try {
      await revokeToken(token)
    } catch (error) {
      logError(['Could not revoke the itch.io token:', error], LogPrefix.Itch)
    }
  }

  static isLoggedIn(): boolean {
    return configStore.get_nodefault('profileId') !== undefined
  }

  static username(): string | undefined {
    return configStore.get_nodefault('user')?.username
  }
}
