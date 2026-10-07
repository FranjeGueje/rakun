import type { GameInfo } from 'common/types'
import { invokeHandler } from 'backend/ipc'
import { libraryManagerMap } from 'backend/storeManagers'
import './../library'

const stores: Record<string, unknown[]> = {
  epic: [],
  gog: [],
  gogInstalled: [],
  nile: [],
  zoom: [],
  zoomInstalled: []
}

jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    legendary: { getGameInfo: jest.fn() },
    nile: { getGameInfo: jest.fn() }
  }
}))
jest.mock('backend/storeManagers/legendary/electronStores', () => ({
  libraryStore: { get: () => stores.epic }
}))
jest.mock('backend/storeManagers/gog/electronStores', () => ({
  libraryStore: { get: () => stores.gog },
  installedGamesStore: { get: () => stores.gogInstalled }
}))
jest.mock('backend/storeManagers/nile/electronStores', () => ({
  libraryStore: { get: () => stores.nile }
}))
jest.mock('backend/storeManagers/zoom/electronStores', () => ({
  libraryStore: { get: () => stores.zoom },
  installedGamesStore: { get: () => stores.zoomInstalled }
}))

const game = (app_name: string, extra: object = {}) =>
  ({ app_name, title: app_name, is_installed: false, ...extra }) as GameInfo

describe('getLibrary', () => {
  beforeEach(() => {
    Object.keys(stores).forEach((key) => (stores[key] = []))
  })

  test('Amazon shows the install state its manager keeps, not the stale store', async () => {
    stores.nile = [game('a'), game('b')]
    jest
      .mocked(libraryManagerMap.nile.getGameInfo)
      .mockImplementation((id) =>
        id === 'a' ? game('a', { is_installed: true }) : undefined
      )

    const result = (await invokeHandler('getLibrary', 'nile')) as GameInfo[]

    expect(result.map((g) => [g.app_name, g.is_installed])).toEqual([
      ['a', true],
      ['b', false]
    ])
  })

  test('GOG gets its install info from the installed store', async () => {
    stores.gog = [game('x'), game('y')]
    stores.gogInstalled = [{ appName: 'x', platform: 'linux' }]

    const result = (await invokeHandler('getLibrary', 'gog')) as GameInfo[]

    expect(result[0]).toMatchObject({
      is_installed: true,
      install: { appName: 'x' }
    })
    expect(result[1].is_installed).toBe(false)
  })

  test('"all" joins every store', async () => {
    stores.gog = [game('g')]
    stores.zoom = [game('z')]

    const result = (await invokeHandler('getLibrary')) as GameInfo[]

    expect(result.map((g) => g.app_name).sort()).toEqual(['g', 'z'])
  })
})
