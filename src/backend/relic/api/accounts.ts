import { addHandler, addListener } from 'backend/ipc'
import { LegendaryUser } from 'backend/storeManagers/legendary/user'
import { GOGUser } from 'backend/storeManagers/gog/user'
import { NileUser } from 'backend/storeManagers/nile/user'
import { ZoomUser } from 'backend/storeManagers/zoom/user'
import { RUNNERS, stores } from 'backend/storeManagers'
import type { AccountsStatus } from 'common/relic/accounts'

addHandler('getUserInfo', () => {
  return LegendaryUser.getUserInfo()
})

addHandler('getAmazonUserInfo', async () => NileUser.getUserData())

// Checks if the user have logged in with Legendary already
addHandler('isLoggedIn', () => LegendaryUser.isLoggedIn())

addHandler('login', async (event, sid) => LegendaryUser.login(sid))
addHandler('authGOG', async (event, code) => GOGUser.login(code))
addHandler('logoutLegendary', () => LegendaryUser.logout())
addListener('logoutGOG', () => GOGUser.logout())

addHandler('getAmazonLoginData', () => NileUser.getLoginData())
addHandler('authAmazon', async (event, data) => NileUser.login(data))
addHandler('logoutAmazon', () => NileUser.logout())

addHandler('authZoom', async (event, url) => {
  const login = ZoomUser.login(url)
  if (login.status === 'done') {
    await ZoomUser.getUserDetails()
  }
  return login
})

addListener('logoutZoom', () => ZoomUser.logout())
addHandler('getZoomUserInfo', async () => ZoomUser.getUserDetails())

/**
 * Who is logged in to each store, from what is stored locally (no network:
 * Zoom's own check asks its API every time)
 */
addHandler('getAccounts', (): AccountsStatus => {
  const accounts = {} as AccountsStatus
  RUNNERS.forEach((runner) => {
    accounts[runner] = stores[runner].session.account()
  })
  return accounts
})
