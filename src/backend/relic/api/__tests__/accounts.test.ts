import { invokeHandler } from 'backend/ipc'
import './../accounts'

const state = {
  epic: undefined as { displayName: string } | undefined,
  epicLoggedIn: false,
  gogLoggedIn: false,
  gogUser: undefined as { username: string } | undefined,
  amazon: undefined as { name: string } | undefined,
  zoomToken: false,
  zoomFlag: false,
  zoomName: undefined as string | undefined
}

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: () => state.zoomToken
}))
jest.mock('backend/storeManagers/legendary/user', () => ({
  LegendaryUser: {
    getUserInfo: () => state.epic,
    isLoggedIn: () => state.epicLoggedIn
  }
}))
jest.mock('backend/storeManagers/gog/user', () => ({
  GOGUser: { isLoggedIn: () => state.gogLoggedIn }
}))
jest.mock('backend/storeManagers/nile/user', () => ({
  NileUser: {
    getUserData: () => state.amazon,
    isLoggedIn: () => state.amazon
  }
}))
jest.mock('backend/storeManagers/zoom/user', () => ({ ZoomUser: {} }))
jest.mock('backend/storeManagers/gog/electronStores', () => ({
  configStore: { get_nodefault: () => state.gogUser }
}))
jest.mock('backend/storeManagers/zoom/electronStores', () => ({
  configStore: {
    get: () => state.zoomFlag,
    get_nodefault: () => state.zoomName
  }
}))
jest.mock('backend/storeManagers/zoom/constants', () => ({
  tokenPath: '/zoom/.token'
}))

describe('getAccounts', () => {
  test('nobody logged in', async () => {
    Object.assign(state, {
      epic: undefined,
      epicLoggedIn: false,
      gogLoggedIn: false,
      gogUser: undefined,
      amazon: undefined,
      zoomToken: false,
      zoomFlag: false,
      zoomName: undefined
    })

    expect(await invokeHandler('getAccounts')).toEqual({
      legendary: { loggedIn: false, name: undefined },
      gog: { loggedIn: false, name: undefined },
      nile: { loggedIn: false, name: undefined },
      zoom: { loggedIn: false, name: undefined }
    })
  })

  test('reports each store and the name it keeps', async () => {
    Object.assign(state, {
      epic: { displayName: 'epicuser' },
      epicLoggedIn: true,
      gogLoggedIn: true,
      gogUser: { username: 'goguser' },
      amazon: { name: 'amazonuser' },
      zoomToken: true,
      zoomFlag: true,
      zoomName: 'zoomuser'
    })

    expect(await invokeHandler('getAccounts')).toEqual({
      legendary: { loggedIn: true, name: 'epicuser' },
      gog: { loggedIn: true, name: 'goguser' },
      nile: { loggedIn: true, name: 'amazonuser' },
      zoom: { loggedIn: true, name: 'zoomuser' }
    })
  })

  test('Zoom needs the token file as well as the stored flag', async () => {
    Object.assign(state, { zoomToken: false, zoomFlag: true })

    const accounts = (await invokeHandler('getAccounts')) as {
      zoom: { loggedIn: boolean }
    }

    expect(accounts.zoom.loggedIn).toBe(false)
  })
})
