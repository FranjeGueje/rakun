import type { Store } from '../store'
import { withInstallInfo } from '../library_view'
import ItchLibraryManager from './library'
import { ItchUser } from './user'
import { loginFromPaste, startItchLogin } from './login'
import { getApiPort } from '../../rakun/server/listening'
import { installedGamesStore, libraryStore } from './stores'

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
    logout: () => ItchUser.logout(),
    check: () => ItchUser.check()
  },
  login: {
    urlParam: 'code',
    start: () => {
      const port = getApiPort()
      if (!port) return Promise.reject(new Error('rakun is not listening yet'))
      return Promise.resolve(startItchLogin(port))
    },
    submit: loginFromPaste
  }
}
