import { invokeHandler } from 'backend/ipc'
import './../accounts'

const state: Record<string, { loggedIn: boolean; name?: string }> = {}

const logouts: string[] = []

jest.mock('backend/storeManagers', () => {
  const store = (runner: string, name: string, label: string) => ({
    id: runner,
    name,
    label,
    session: {
      account: () => state[runner],
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
    expect(await invokeHandler('getStores')).toEqual([
      { id: 'legendary', name: 'epic', label: 'Epic' },
      { id: 'gog', name: 'gog', label: 'GOG' },
      { id: 'nile', name: 'amazon', label: 'Amazon' },
      { id: 'zoom', name: 'zoom', label: 'Zoom' }
    ])
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
