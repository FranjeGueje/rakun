import { dirname } from 'path'
import type { Store } from '../store'
import { withInstallInfo } from '../library_view'
import GOGLibraryManager from './library'
import { GOGUser } from './user'
import {
  configStore,
  installedGamesStore,
  libraryStore
} from './electronStores'
import { gogdlAuthConfig } from './constants'

const gogLoginUrl =
  'https://auth.gog.com/auth?client_id=46899977096215655&redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient&response_type=code&layout=galaxy'

export const gog: Store<GOGLibraryManager> = {
  id: 'gog',
  name: 'gog',
  label: 'GOG',
  library: new GOGLibraryManager(),
  readLibrary: () =>
    withInstallInfo(
      libraryStore.get('games', []),
      installedGamesStore.get('installed', [])
    ),
  session: {
    dir: dirname(gogdlAuthConfig),
    main: 'auth.json',
    files: () => ['auth.json'],
    account: () => ({
      loggedIn: !!GOGUser.isLoggedIn(),
      name: configStore.get_nodefault('userData')?.username
    }),
    // The "logged in" flag lives in a store and getUserDetails fills in the name
    isAccepted: async () => {
      configStore.set('isLoggedIn', true)
      return !!(await GOGUser.getUserDetails())
    },
    discard: () => GOGUser.logout(),
    logout: () => Promise.resolve(GOGUser.logout())
  },
  login: {
    urlParam: 'code',
    start: () =>
      Promise.resolve({
        runner: 'gog',
        url: gogLoginUrl,
        instructions:
          'Log in to GOG. The browser ends on an embed.gog.com address (it can look blank): paste that full address.'
      }),
    submit: async (code) =>
      (await GOGUser.login(code)).status === 'done'
        ? { ok: true }
        : { ok: false, error: 'The store rejected the login' }
  }
}
