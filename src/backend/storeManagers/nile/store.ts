import type { NileLoginData } from 'common/types/nile'
import type { Store } from '../store'
import { withLiveInfo } from '../library_view'
import NileLibraryManager from './library'
import { NileUser } from './user'
import { libraryStore } from './electronStores'

const library = new NileLibraryManager()

// Amazon hands out a one-time verifier together with the login URL; it has to
// be remembered until the user comes back with the code
let pendingLogin: NileLoginData | undefined

async function submitCode(code: string) {
  if (!pendingLogin) {
    return { ok: false, error: 'Request the Amazon login (getLoginInfo) first' }
  }
  const { code_verifier, serial, client_id } = pendingLogin
  const result = await NileUser.login({
    code,
    code_verifier,
    serial,
    client_id
  })
  pendingLogin = undefined
  return result.status === 'done'
    ? { ok: true }
    : { ok: false, error: 'The store rejected the login' }
}

export const nile: Store<NileLibraryManager> = {
  id: 'nile',
  name: 'amazon',
  label: 'Amazon',
  library,
  readLibrary: () => withLiveInfo(library, libraryStore.get('library', [])),
  session: {
    // getUserData fills in the stored user that isLoggedIn reads
    account: () => {
      const user = NileUser.getUserData()
      return { loggedIn: !!NileUser.isLoggedIn(), name: user?.name }
    },
    logout: () => NileUser.logout()
  },
  login: {
    urlParam: 'openid.oa2.authorization_code',
    start: async () => {
      pendingLogin = await NileUser.getLoginData()
      return {
        runner: 'nile',
        url: pendingLogin.url,
        instructions:
          'Log in to Amazon. Paste the full address of the page the browser ends on.'
      }
    },
    submit: submitCode
  }
}
