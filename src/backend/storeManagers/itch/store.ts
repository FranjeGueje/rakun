import type { Store } from '../store'
import { withInstallInfo } from '../library_view'
import ItchLibraryManager from './library'
import { ItchUser, loginErrorMessage } from './user'
import { installedGamesStore, libraryStore } from './electronStores'
import { apiKeysUrl } from './constants'

export const itch: Store<ItchLibraryManager> = {
  id: 'itch',
  name: 'itch',
  label: 'itch.io',
  library: new ItchLibraryManager(),
  readLibrary: () =>
    withInstallInfo(
      libraryStore.get('games', []),
      installedGamesStore.get('installed', [])
    ),
  session: {
    account: () => ({
      loggedIn: ItchUser.isLoggedIn(),
      name: ItchUser.username()
    }),
    logout: () => ItchUser.logout()
  },
  login: {
    // The user pastes the key on its own: there is no address to take a code from
    urlParam: 'api_key',
    start: () =>
      Promise.resolve({
        runner: 'itch',
        url: apiKeysUrl,
        instructions:
          'Log in to itch.io, click "Generate new API key", copy the key and paste it here.'
      }),
    submit: async (key) => {
      try {
        await ItchUser.login(key)
        return { ok: true }
      } catch (error) {
        return { ok: false, error: loginErrorMessage(error) }
      }
    }
  }
}
