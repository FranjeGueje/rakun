import type { GameInfo } from 'common/types'
import { invokeHandler } from 'backend/ipc'
import './../library'

const games: Record<string, GameInfo[]> = {
  legendary: [],
  gog: [],
  nile: [],
  zoom: []
}

jest.mock('backend/storeManagers', () => {
  const store = (runner: string) => ({ readLibrary: () => games[runner] })
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

const game = (app_name: string) => ({ app_name }) as GameInfo

describe('getLibrary', () => {
  beforeEach(() => {
    Object.keys(games).forEach((key) => (games[key] = []))
  })

  test('returns the games of one store', async () => {
    games.nile = [game('a')]
    games.gog = [game('g')]

    const result = (await invokeHandler('getLibrary', 'nile')) as GameInfo[]

    expect(result.map((g) => g.app_name)).toEqual(['a'])
  })

  test('"all" joins every store', async () => {
    games.gog = [game('g')]
    games.zoom = [game('z')]

    const result = (await invokeHandler('getLibrary')) as GameInfo[]

    expect(result.map((g) => g.app_name).sort()).toEqual(['g', 'z'])
  })
})
