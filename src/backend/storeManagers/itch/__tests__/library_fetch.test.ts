jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Itch: 'Itch' }
}))

import { logInfo, logWarning } from 'backend/logger'
import { ButlerdError, type Butlerd } from '../butlerd'
import { fetchCollectionGames, fetchOwnedGames } from '../library_fetch'

const game = (id: number) => ({ id, title: `G${id}`, url: '' })

/** A butlerd that answers each method with what the test says, or fails with it */
const butlerdWith = (answers: Record<string, unknown>) =>
  ({
    call: jest.fn((method: string, params: { collectionId?: number }) => {
      const answer =
        answers[`${method}:${params.collectionId ?? ''}`] ?? answers[method]
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer)
    })
  }) as unknown as Butlerd

const noPermission = () =>
  new ButlerdError(12000, 'api key does not permit `collection:view`')

beforeEach(() => jest.clearAllMocks())

describe('fetchOwnedGames', () => {
  test('reads every page of the keys', async () => {
    const pages = [
      { items: [{ game: game(1) }], nextCursor: 'c1' },
      { items: [{ game: game(2) }] }
    ]
    const butlerd = {
      call: jest.fn().mockImplementation(() => Promise.resolve(pages.shift()))
    } as unknown as Butlerd

    expect((await fetchOwnedGames(butlerd, 7)).map((g) => g.id)).toEqual([1, 2])
  })
})

describe('fetchCollectionGames', () => {
  const collections = {
    items: [
      { id: 1, title: 'One' },
      { id: 2, title: 'Two' }
    ]
  }

  test('collects the games of every collection', async () => {
    const butlerd = butlerdWith({
      'Fetch.ProfileCollections': collections,
      'Fetch.Collection.Games:1': { items: [{ game: game(10) }] },
      'Fetch.Collection.Games:2': { items: [{ game: game(20) }] }
    })

    expect((await fetchCollectionGames(butlerd, 7)).map((g) => g.id)).toEqual([
      10, 20
    ])
  })

  test('a collection that fails is left out and the others are read', async () => {
    const butlerd = butlerdWith({
      'Fetch.ProfileCollections': collections,
      'Fetch.Collection.Games:1': new Error('boom'),
      'Fetch.Collection.Games:2': { items: [{ game: game(20) }] }
    })

    expect((await fetchCollectionGames(butlerd, 7)).map((g) => g.id)).toEqual([
      20
    ])
    expect(logWarning).toHaveBeenCalledTimes(1)
  })

  test('a login that cannot read collections says so once and stops asking', async () => {
    const butlerd = butlerdWith({
      'Fetch.ProfileCollections': collections,
      'Fetch.Collection.Games:1': noPermission(),
      'Fetch.Collection.Games:2': noPermission()
    })

    expect(await fetchCollectionGames(butlerd, 7)).toEqual([])

    expect(logInfo).toHaveBeenCalledTimes(1)
    expect(logWarning).not.toHaveBeenCalled()
    const gameCalls = jest
      .mocked(butlerd.call)
      .mock.calls.filter(([method]) => method === 'Fetch.Collection.Games')
    expect(gameCalls).toHaveLength(1)
  })
})
