import type { StoreInfo } from 'common/rakun/stores'
import { invokeHandler } from 'backend/ipc'
import {
  clearSessionExpired,
  isSessionExpired,
  markSessionExpired
} from 'backend/storeManagers/session_state'
import './../accounts'

const state: Record<string, { loggedIn: boolean; name?: string }> = {}

const logouts: string[] = []
// What each store answers when asked over the network (a store with no entry has no way to ask)
const checks: Record<string, () => Promise<boolean | undefined>> = {}

jest.mock('backend/storeManagers', () => {
  const store = (runner: string, name: string, label: string) => ({
    id: runner,
    name,
    label,
    session: {
      account: () => state[runner],
      // Read when used: the checks of a test are set after the mock is built
      get check() {
        return checks[runner]
      },
      logout: () => {
        logouts.push(runner)
        return Promise.resolve()
      }
    }
  })
  const stores: Record<string, ReturnType<typeof store>> = {
    legendary: store('legendary', 'epic', 'Epic'),
    gog: store('gog', 'gog', 'GOG'),
    nile: store('nile', 'amazon', 'Amazon'),
    zoom: store('zoom', 'zoom', 'Zoom')
  }
  return {
    RUNNERS: Object.keys(stores),
    stores,
    getStore: (runner: string) => {
      if (!stores[runner]) throw new Error(`Unknown store "${runner}"`)
      return stores[runner]
    }
  }
})
jest.mock('backend/logger')
jest.mock('backend/storeManagers/legendary/user', () => ({ LegendaryUser: {} }))
jest.mock('backend/storeManagers/gog/user', () => ({ GOGUser: {} }))
jest.mock('backend/storeManagers/nile/user', () => ({ NileUser: {} }))
jest.mock('backend/storeManagers/zoom/user', () => ({ ZoomUser: {} }))

describe('getAccounts', () => {
  test('asks every store for its account and answers by runner', async () => {
    Object.assign(state, {
      legendary: { loggedIn: true, name: 'epicuser' },
      gog: { loggedIn: false },
      nile: { loggedIn: true, name: 'amazonuser' },
      zoom: { loggedIn: false }
    })

    expect(await invokeHandler('getAccounts')).toEqual({
      legendary: { loggedIn: true, name: 'epicuser' },
      gog: { loggedIn: false },
      nile: { loggedIn: true, name: 'amazonuser' },
      zoom: { loggedIn: false }
    })
  })
})

describe('getStores', () => {
  test('lists id, name and label of every store in order', async () => {
    const stores = (await invokeHandler('getStores')) as StoreInfo[]
    expect(stores.map(({ id, name, label }) => ({ id, name, label }))).toEqual([
      { id: 'legendary', name: 'epic', label: 'Epic' },
      { id: 'gog', name: 'gog', label: 'GOG' },
      { id: 'nile', name: 'amazon', label: 'Amazon' },
      { id: 'zoom', name: 'zoom', label: 'Zoom' }
    ])
  })

  test('says what each store can do', async () => {
    const stores = (await invokeHandler('getStores')) as StoreInfo[]
    const caps = Object.fromEntries(stores.map((s) => [s.id, s.caps]))
    expect(caps.legendary).toEqual({
      import: true,
      update: true,
      repair: true,
      lowercasePlatform: false,
      directLaunch: false
    })
    expect(caps.gog.lowercasePlatform).toBe(true)
    expect(caps.zoom).toMatchObject({
      import: false,
      update: false,
      repair: false,
      directLaunch: true
    })
  })
})

describe('logout', () => {
  test('ends the session of the store asked for', async () => {
    await invokeHandler('logout', 'nile')
    expect(logouts).toEqual(['nile'])
  })

  test('refuses a store that does not exist', async () => {
    await expect(invokeHandler('logout', 'steam')).rejects.toThrow(
      'Unknown store "steam"'
    )
  })
})

describe('checkAccounts', () => {
  beforeEach(() => {
    Object.assign(state, {
      legendary: { loggedIn: true, name: 'epicuser' },
      gog: { loggedIn: true, name: 'goguser' },
      nile: { loggedIn: false },
      zoom: { loggedIn: true, name: 'zoomuser' }
    })
    for (const runner of Object.keys(checks)) delete checks[runner]
    for (const runner of ['legendary', 'gog', 'nile', 'zoom'] as const)
      clearSessionExpired(runner)
  })

  test('a store that can be asked says if the session works', async () => {
    checks.gog = () => Promise.resolve(true)
    checks.zoom = () => Promise.resolve(false)

    const result = await invokeHandler('checkAccounts')

    expect(result).toMatchObject({
      gog: { loggedIn: true, verified: true },
      zoom: { loggedIn: false, verified: true }
    })
  })

  test('a store that refuses the session is marked expired, and one that accepts it is not', async () => {
    checks.gog = () => Promise.resolve(true)
    checks.zoom = () => Promise.resolve(false)

    await invokeHandler('checkAccounts')

    expect(isSessionExpired('zoom')).toBe(true)
    expect(isSessionExpired('gog')).toBe(false)
  })

  test('a store with no way to ask answers what is stored, unverified', async () => {
    expect(await invokeHandler('checkAccounts')).toMatchObject({
      legendary: { loggedIn: true, verified: false }
    })
  })

  test('an answer that never came, or a failure, leaves it unverified', async () => {
    checks.gog = () => Promise.resolve(undefined)
    checks.zoom = () => Promise.reject(new Error('timeout'))

    expect(await invokeHandler('checkAccounts')).toMatchObject({
      gog: { loggedIn: true, verified: false },
      zoom: { loggedIn: true, verified: false }
    })
  })

  test('a store with no session is not asked: it is certainly out', async () => {
    const check = jest.fn()
    checks.nile = check

    expect(await invokeHandler('checkAccounts')).toMatchObject({
      nile: { loggedIn: false, verified: true }
    })
    expect(check).not.toHaveBeenCalled()
  })
})

describe('expired sessions', () => {
  beforeEach(() => {
    Object.assign(state, {
      legendary: { loggedIn: true, name: 'epicuser' },
      gog: { loggedIn: true, name: 'goguser' },
      nile: { loggedIn: false },
      zoom: { loggedIn: false }
    })
    for (const runner of ['legendary', 'gog', 'nile', 'zoom'] as const)
      clearSessionExpired(runner)
  })

  test('getAccounts says which session the store refused, and keeps the rest of the account', async () => {
    markSessionExpired('gog')

    const accounts = (await invokeHandler('getAccounts')) as Record<
      string,
      { loggedIn: boolean; name?: string; expired?: boolean }
    >

    expect(accounts.gog).toEqual({
      loggedIn: true,
      name: 'goguser',
      expired: true
    })
    expect(accounts.legendary.expired).toBeUndefined()
  })

  test('a store with no session at all is not «expired»', async () => {
    markSessionExpired('nile')

    const accounts = (await invokeHandler('getAccounts')) as Record<
      string,
      { expired?: boolean }
    >

    expect(accounts.nile.expired).toBeUndefined()
  })

  test('logging out ends it, and so does a failed logout not', async () => {
    markSessionExpired('gog')
    await invokeHandler('logout', 'gog')
    expect(isSessionExpired('gog')).toBe(false)
  })
})
