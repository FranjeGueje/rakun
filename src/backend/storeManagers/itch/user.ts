import { logError, logInfo, LogPrefix } from 'backend/logger'
import type { ItchUser as ItchUserData } from 'common/types/itch'
import { ButlerdError } from './butlerd'
import { getButlerd } from './client'
import { configStore } from './electronStores'

type LoginResult = { profile: { id: number; user: ItchUserData } }

/** Only a key with every permission can read the library (the one `butler login` makes cannot) */
export function loginErrorMessage(error: unknown): string {
  if (error instanceof ButlerdError && /does not permit/.test(error.message))
    return 'That key does not have the permissions rakun needs: create a new one in itch.io → Settings → API keys'
  return error instanceof Error ? error.message : String(error)
}

export class ItchUser {
  /** Gives butler the key; it keeps it (in its own database), rakun does not */
  static async login(apiKey: string): Promise<void> {
    const butlerd = await getButlerd()
    const { profile } = await butlerd.call<LoginResult>(
      'Profile.LoginWithAPIKey',
      { apiKey }
    )
    configStore.set('profileId', profile.id)
    configStore.set('user', profile.user)
    logInfo(`Logged in as ${profile.user.username}`, LogPrefix.Itch)
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
    configStore.delete('profileId')
    configStore.delete('user')
  }

  static isLoggedIn(): boolean {
    return configStore.get_nodefault('profileId') !== undefined
  }

  static username(): string | undefined {
    return configStore.get_nodefault('user')?.username
  }
}
