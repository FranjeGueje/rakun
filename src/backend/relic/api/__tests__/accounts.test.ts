import { invokeHandler } from 'backend/ipc'
import './../accounts'

const state: Record<string, { loggedIn: boolean; name?: string }> = {}

jest.mock('backend/storeManagers', () => {
  const store = (runner: string) => ({
    session: { account: () => state[runner] }
  })
  return {
    RUNNERS: ['legendary', 'gog', 'nile', 'zoom'],
    stores: {
      legendary: store('legendary'),
      gog: store('gog'),
      nile: store('nile'),
      zoom: store('zoom')
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
