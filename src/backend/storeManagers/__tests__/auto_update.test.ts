import { addToQueue } from 'backend/downloadmanager/downloadqueue'
import { autoUpdate, libraryManagerMap } from '..'

jest.mock('backend/downloadmanager/downloadqueue', () => ({
  addToQueue: jest.fn()
}))
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  RunnerToLogPrefixMap: {}
}))

jest.mock('../legendary/store', () => ({
  legendary: { id: 'legendary', library: { getGame: jest.fn() } }
}))
jest.mock('../gog/store', () => ({ gog: { id: 'gog', library: {} } }))
jest.mock('../nile/store', () => ({ nile: { id: 'nile', library: {} } }))
jest.mock('../zoom/store', () => ({ zoom: { id: 'zoom', library: {} } }))

type Availability = boolean | Error

/** Games by name; the value says whether the update can be queued */
function givenGames(games: Record<string, Availability>) {
  jest
    .mocked(libraryManagerMap.legendary.getGame)
    .mockImplementation((appName: string) => {
      const available = games[appName]
      return {
        getGameInfo: () => ({
          app_name: appName,
          title: appName,
          runner: 'legendary',
          install: { install_path: `/games/${appName}`, platform: 'Windows' }
        }),
        isGameAvailable: () =>
          available instanceof Error
            ? Promise.reject(available)
            : Promise.resolve(available)
      } as never
    })
}

const queuedNames = () =>
  jest.mocked(addToQueue).mock.calls.map(([element]) => element.params.appName)

describe('autoUpdate', () => {
  beforeEach(() => {
    jest.mocked(addToQueue).mockResolvedValue(undefined)
  })

  test('queues every game that can be updated and returns none', async () => {
    givenGames({ a: true, b: true })

    expect(await autoUpdate('legendary', ['a', 'b'])).toEqual([])
    expect(queuedNames()).toEqual(['a', 'b'])
  })

  test('returns the games it could not queue, which still need an update by hand', async () => {
    givenGames({ a: true, b: false, c: true })

    expect(await autoUpdate('legendary', ['a', 'b', 'c'])).toEqual(['b'])
    expect(queuedNames()).toEqual(['a', 'c'])
  })

  test('a game that fails to answer stays in the list and does not stop the others', async () => {
    givenGames({ a: new Error('offline'), b: true })

    expect(await autoUpdate('legendary', ['a', 'b'])).toEqual(['a'])
    expect(queuedNames()).toEqual(['b'])
  })

  test('does not wait for the queue, which asks the store for the size', async () => {
    givenGames({ a: true })
    jest.mocked(addToQueue).mockReturnValue(new Promise(() => undefined))

    expect(await autoUpdate('legendary', ['a'])).toEqual([])
  })

  test('a queue that fails does not break the check', async () => {
    givenGames({ a: true })
    jest.mocked(addToQueue).mockRejectedValue(new Error('no size'))

    await expect(autoUpdate('legendary', ['a'])).resolves.toEqual([])
  })

  test('nothing to update, nothing queued', async () => {
    expect(await autoUpdate('legendary', [])).toEqual([])
    expect(addToQueue).not.toHaveBeenCalled()
  })
})
