const mockCall = jest.fn()
const mockStore: Record<string, unknown> = {}

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Itch: 'Itch' }
}))
jest.mock('../client', () => ({
  getButlerd: () => Promise.resolve({ call: mockCall })
}))
jest.mock('../electronStores', () => ({
  configStore: {
    get_nodefault: (key: string) => mockStore[key],
    set: (key: string, value: unknown) => {
      mockStore[key] = value
    },
    delete: (key: string) => {
      delete mockStore[key]
    }
  }
}))
jest.mock('../oauth', () => ({ revokeToken: jest.fn() }))
jest.mock('../../../utils', () => ({ clearCache: jest.fn() }))

import { logError } from 'backend/logger'
import { clearCache } from '../../../utils'
import { revokeToken } from '../oauth'
import { ItchUser } from '../user'
import { ButlerdError, isAuthRefusal } from '../butlerd'

const revoke = jest.mocked(revokeToken)

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of Object.keys(mockStore)) delete mockStore[key]
  mockCall.mockResolvedValue({ profile: { id: 7, user: { username: 'ana' } } })
  revoke.mockResolvedValue(undefined)
})

describe('login', () => {
  test('gives butler the key and remembers who logged in', async () => {
    await ItchUser.login('KEY')

    expect(mockCall).toHaveBeenCalledWith('Profile.LoginWithAPIKey', {
      apiKey: 'KEY'
    })
    expect(ItchUser.isLoggedIn()).toBe(true)
    expect(ItchUser.username()).toBe('ana')
  })

  test('keeps the token of an OAuth login, to revoke it, and not that of an API key', async () => {
    await ItchUser.login('TOKEN', true)
    expect(mockStore.oauthToken).toBe('TOKEN')

    await ItchUser.login('KEY')
    expect(mockStore.oauthToken).toBeUndefined()
  })
})

describe('logout', () => {
  test('forgets the profile in butler, revokes the OAuth token and forgets everything', async () => {
    await ItchUser.login('TOKEN', true)
    mockCall.mockClear()

    await ItchUser.logout()

    expect(mockCall).toHaveBeenCalledWith('Profile.Forget', { profileId: 7 })
    expect(revoke).toHaveBeenCalledWith('TOKEN')
    expect(ItchUser.isLoggedIn()).toBe(false)
    expect(mockStore.oauthToken).toBeUndefined()
  })

  test('clears the cache of the library, like the other stores do', async () => {
    await ItchUser.login('KEY')
    await ItchUser.logout()
    expect(clearCache).toHaveBeenCalledWith('itch')
  })

  test('a key that was pasted has nothing to revoke', async () => {
    await ItchUser.login('KEY')
    await ItchUser.logout()
    expect(revoke).not.toHaveBeenCalled()
  })

  test('a revoke that fails is logged and the logout still ends', async () => {
    await ItchUser.login('TOKEN', true)
    revoke.mockRejectedValue(new Error('offline'))

    await ItchUser.logout()

    expect(logError).toHaveBeenCalled()
    expect(ItchUser.isLoggedIn()).toBe(false)
    expect(mockStore.oauthToken).toBeUndefined()
  })
})

// The words are the ones butler really gave for a revoked key
const REVOKED = 'itch.io API error (403): /profile: invalid key'

describe('isAuthRefusal', () => {
  test('a revoked key is a refusal, whatever the 401 or 403', () => {
    expect(isAuthRefusal(new ButlerdError(1, REVOKED))).toBe(true)
    expect(
      isAuthRefusal(new ButlerdError(1, 'itch.io API error (401): /profile'))
    ).toBe(true)
  })

  test('a server error, a network failure or any other error is not', () => {
    expect(
      isAuthRefusal(new ButlerdError(1, 'itch.io API error (500): /profile'))
    ).toBe(false)
    expect(isAuthRefusal(new ButlerdError(1, 'cave not found'))).toBe(false)
    expect(isAuthRefusal(new Error(REVOKED))).toBe(false)
    expect(isAuthRefusal(undefined)).toBe(false)
  })
})

describe('check', () => {
  test('with no saved login it is out, without asking butler', async () => {
    expect(await ItchUser.check()).toBe(false)
    expect(mockCall).not.toHaveBeenCalled()
  })

  test('butler and itch.io accept it: it works, and the server was really asked', async () => {
    mockStore.profileId = 7

    expect(await ItchUser.check()).toBe(true)
    expect(mockCall).toHaveBeenCalledWith('Profile.UseSavedLogin', {
      profileId: 7
    })
    expect(mockCall).toHaveBeenCalledWith('Fetch.ProfileOwnedKeys', {
      profileId: 7,
      fresh: true
    })
  })

  test('the saved login passes butler but the fresh fetch is refused: out', async () => {
    mockStore.profileId = 7
    mockCall.mockImplementation((method: string) =>
      method === 'Fetch.ProfileOwnedKeys'
        ? Promise.reject(new ButlerdError(1, REVOKED))
        : Promise.resolve({})
    )

    expect(await ItchUser.check()).toBe(false)
  })

  test('itch.io refuses the key: out', async () => {
    mockStore.profileId = 7
    mockCall.mockRejectedValue(new ButlerdError(1, REVOKED))

    expect(await ItchUser.check()).toBe(false)
  })

  test('butler or the network failed: cannot tell', async () => {
    mockStore.profileId = 7
    mockCall.mockRejectedValue(new Error('connection refused'))

    expect(await ItchUser.check()).toBeUndefined()
  })
})
