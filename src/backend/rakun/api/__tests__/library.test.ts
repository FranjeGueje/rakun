import type { GameInfo } from 'common/types'
import { invokeHandler } from 'backend/ipc'
import './../library'

const games: Record<string, GameInfo[]> = {
  legendary: [],
  gog: [],
  nile: [],
  zoom: []
}

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  RunnerToLogPrefixMap: {}
}))

const updateable: Record<string, string[] | Error> = {}

jest.mock('backend/storeManagers', () => {
  const store = (runner: string) => ({
    readLibrary: () => games[runner],
    library: {
      listUpdateableGames: () => {
        const found = updateable[runner] ?? []
        return found instanceof Error
          ? Promise.reject(found)
          : Promise.resolve(found)
      }
    }
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

describe('getUpdateableGames', () => {
  beforeEach(() => {
    Object.keys(updateable).forEach((key) => delete updateable[key])
  })

  test('names the store of each game and queues nothing', async () => {
    updateable.legendary = ['e1']
    updateable.gog = ['g1', 'g2']

    expect(await invokeHandler('getUpdateableGames')).toEqual([
      { runner: 'legendary', appName: 'e1' },
      { runner: 'gog', appName: 'g1' },
      { runner: 'gog', appName: 'g2' }
    ])
  })

  test('a store that fails does not hide the others', async () => {
    updateable.legendary = new Error('offline')
    updateable.nile = ['n1']

    expect(await invokeHandler('getUpdateableGames')).toEqual([
      { runner: 'nile', appName: 'n1' }
    ])
  })
})
