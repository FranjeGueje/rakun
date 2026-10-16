import { existsSync } from 'fs'
import type { Store } from '../store'
import { withInstallInfo } from '../library_view'
import ZoomLibraryManager from './library'
import { ZoomUser } from './user'
import {
  configStore,
  installedGamesStore,
  libraryStore
} from './electronStores'
import { tokenPath } from './constants'

const zoomLoginUrl =
  'https://www.zoom-platform.com/login?li=relic&return_li_token=true'

// ZoomUser.login wants the address Zoom redirects to, not the bare token
const ZOOM_CALLBACK = 'https://www.zoom-platform.com/'

export const zoom: Store<ZoomLibraryManager> = {
  id: 'zoom',
  name: 'zoom',
  label: 'Zoom',
  library: new ZoomLibraryManager(),
  readLibrary: () =>
    withInstallInfo(
      libraryStore.get('games', []),
      installedGamesStore.get('installed', [])
    ),
  session: {
    account: () => ({
      loggedIn: existsSync(tokenPath) && !!configStore.get('isLoggedIn', false),
      name: configStore.get_nodefault('username')
    }),
    logout: () => Promise.resolve(ZoomUser.logout()),
    // A rejected token makes getUserDetails log out (and the token goes); an
    // answer that never came (offline, Zoom down) leaves it, and says nothing
    check: async () => {
      if (!existsSync(tokenPath)) return false
      if (await ZoomUser.getUserDetails()) return true
      return existsSync(tokenPath) ? undefined : false
    }
  },
  login: {
    urlParam: 'li_token',
    start: () =>
      Promise.resolve({
        runner: 'zoom',
        url: zoomLoginUrl,
        instructions:
          'Log in to Zoom. Paste the full address of the page the browser ends on.'
      }),
    submit: async (code) => {
      const callback = `${ZOOM_CALLBACK}?li_token=${encodeURIComponent(code)}`
      if (ZoomUser.login(callback).status !== 'done') {
        return { ok: false, error: 'The store rejected the login' }
      }
      await ZoomUser.getUserDetails()
      return { ok: true }
    }
  }
}
