// What a refresh does with a key itch.io refused: the library stays and the
// session is marked, and a refresh that works clears the mark
const mockCall = jest.fn()

jest.mock('backend/logger')
jest.mock('backend/ipc', () => ({ sendFrontendMessage: jest.fn() }))
jest.mock('backend/online_monitor', () => ({ isOnline: jest.fn() }))
jest.mock('../client', () => ({
  getButlerd: () => Promise.resolve({ call: mockCall })
}))
jest.mock('../stores', () => ({
  configStore: { get: jest.fn(() => 7), get_nodefault: jest.fn(() => 7) },
  installedGamesStore: { get: jest.fn(() => []), set: jest.fn() },
  libraryStore: { get: jest.fn(() => []), set: jest.fn(), clear: jest.fn() }
}))
jest.mock('../user', () => ({
  ItchUser: { isLoggedIn: jest.fn(() => true) }
}))
jest.mock('../games', () => ({ default: class {} }))
jest.mock('../library_fetch', () => ({
  fetchOwnedGames: jest.fn(),
  fetchCollectionGames: jest.fn()
}))
jest.mock('../../index', () => ({ libraryManagerMap: {} }))

import { isOnline } from 'backend/online_monitor'
import { configStore, installedGamesStore, libraryStore } from '../stores'
import { ItchUser } from '../user'
import { ButlerdError } from '../butlerd'
import { fetchOwnedGames, fetchCollectionGames } from '../library_fetch'
import { clearSessionExpired, isSessionExpired } from '../../session_state'
import ItchLibraryManager from '../library'

// The config resets the mocks before each test: what they answer is set here
beforeEach(() => {
  clearSessionExpired('itch')
  jest.mocked(configStore.get).mockReturnValue(7)
  jest.mocked(installedGamesStore.get).mockReturnValue([])
  jest.mocked(libraryStore.get).mockReturnValue([])
  jest.mocked(isOnline).mockReturnValue(true)
  jest.mocked(ItchUser.isLoggedIn).mockReturnValue(true)
  mockCall.mockResolvedValue({})
  jest.mocked(fetchOwnedGames).mockResolvedValue([])
  jest.mocked(fetchCollectionGames).mockResolvedValue([])
})

describe('ItchLibraryManager.refresh and a refused key', () => {
  test('itch.io says «invalid key»: the session is marked expired', async () => {
    mockCall.mockRejectedValue(
      new ButlerdError(1, 'itch.io API error (403): /profile: invalid key')
    )

    const result = await new ItchLibraryManager().refresh()

    expect(result.stderr).toBe('Error loading library')
    expect(isSessionExpired('itch')).toBe(true)
  })

  test('any other failure does not mark it', async () => {
    mockCall.mockRejectedValue(new Error('connection refused'))

    await new ItchLibraryManager().refresh()

    expect(isSessionExpired('itch')).toBe(false)
  })

  test('a refresh that works clears the mark', async () => {
    // The key was refused once, and works again (a new login, or a hiccup)
    mockCall.mockRejectedValueOnce(
      new ButlerdError(1, 'itch.io API error (403): /profile: invalid key')
    )
    const library = new ItchLibraryManager()
    await library.refresh()
    expect(isSessionExpired('itch')).toBe(true)

    await library.refresh()

    expect(isSessionExpired('itch')).toBe(false)
  })
})
