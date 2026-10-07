import { addToQueue } from 'backend/downloadmanager/downloadqueue'
import { autoUpdate, libraryManagerMap } from '..'

jest.mock('backend/downloadmanager/downloadqueue', () => ({
  addToQueue: jest.fn()
}))
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  RunnerToLogPrefixMap: {}
}))

jest.mock('../legendary/store', () => ({
  legendary: { id: 'legendary', library: { getGame: jest.fn() } }
}))
jest.mock('../gog/store', () => ({ gog: { id: 'gog', library: {} } }))
jest.mock('../nile/store', () => ({ nile: { id: 'nile', library: {} } }))
jest.mock('../zoom/store', () => ({ zoom: { id: 'zoom', library: {} } }))

function gameWith(available: boolean) {
  return {
    getGameInfo: () => ({
      app_name: 'x',
      runner: 'legendary',
      install: { install_path: '/games/x', platform: 'Windows' }
    }),
    isGameAvailable: () => Promise.resolve(available)
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('autoUpdate', () => {
  test('queues every game that has an update available, with no per-game opt-out', async () => {
    jest
      .mocked(libraryManagerMap.legendary.getGame)
      .mockReturnValue(gameWith(true) as never)

    autoUpdate('legendary', ['a', 'b'])
    await flush()

    expect(addToQueue).toHaveBeenCalledTimes(2)
  })

  test('queues nothing when the update is not available', async () => {
    jest
      .mocked(libraryManagerMap.legendary.getGame)
      .mockReturnValue(gameWith(false) as never)

    autoUpdate('legendary', ['a'])
    await flush()

    expect(addToQueue).not.toHaveBeenCalled()
  })
})
