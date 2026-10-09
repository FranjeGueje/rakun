import type { Store } from '../store'
import { withLiveInfo } from '../library_view'
import { epicLoginUrl } from 'backend/constants/urls'
import LegendaryLibraryManager from './library'
import { LegendaryUser } from './user'
import { libraryStore } from './electronStores'

const library = new LegendaryLibraryManager()

export const legendary: Store<LegendaryLibraryManager> = {
  id: 'legendary',
  name: 'epic',
  label: 'Epic',
  library,
  readLibrary: () => withLiveInfo(library, libraryStore.get('library', [])),
  session: {
    account: () => ({
      loggedIn: LegendaryUser.isLoggedIn(),
      name: LegendaryUser.getUserInfo()?.displayName
    }),
    logout: () => LegendaryUser.logout()
  },
  login: {
    urlParam: 'code',
    start: () =>
      Promise.resolve({
        runner: 'legendary',
        url: epicLoginUrl,
        instructions:
          'Log in to Epic. The page that follows shows a JSON: paste it (or just its "authorizationCode").'
      }),
    submit: async (code) =>
      (await LegendaryUser.login(code)).status === 'done'
        ? { ok: true }
        : { ok: false, error: 'The store rejected the login' }
  }
}
