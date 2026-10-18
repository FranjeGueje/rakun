import { invokeHandler } from 'backend/ipc'
import { libraryManagerMap } from 'backend/storeManagers'
import { GlobalConfig } from 'backend/config'
import './../games'

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => false),
  watch: jest.fn()
}))
jest.mock('backend/config', () => ({ GlobalConfig: { get: jest.fn() } }))
jest.mock('backend/utils', () => ({ sendGameStatusUpdate: jest.fn() }))
jest.mock('backend/utils/uninstaller', () => ({
  uninstallGameCallback: jest.fn()
}))
jest.mock('backend/logger')
jest.mock('backend/online_monitor', () => ({ isOnline: jest.fn() }))
jest.mock('backend/dialog/dialog', () => ({
  showDialogBoxModalAuto: jest.fn()
}))
jest.mock('backend/utils/aborthandler/aborthandler', () => ({
  callAbortController: jest.fn()
}))
jest.mock('backend/storeManagers', () => ({
  autoUpdate: jest.fn((_runner: string, games: string[]) =>
    Promise.resolve(games)
  ),
  libraryManagerMap: { gog: { listUpdateableGames: jest.fn() } }
}))
jest.mock('backend/storeManagers/legendary/constants', () => ({
  legendaryInstalled: '/tmp/installed.json'
}))
jest.mock('backend/rakun/game_events', () => ({
  onGameInstalled: jest.fn(),
  onGameMoved: jest.fn(),
  onGameRepaired: jest.fn()
}))
jest.mock('../refresh', () => ({
  refreshingRunners: jest.fn(),
  startRefresh: jest.fn()
}))

const list = () =>
  jest.mocked(libraryManagerMap.gog.listUpdateableGames as jest.Mock)

// The config resets the mocks before each test: what they answer is set here
beforeEach(() => {
  jest.mocked(GlobalConfig.get).mockReturnValue({
    getSettings: () => ({ autoUpdateGames: false })
  } as never)
})

describe('checkGameUpdates', () => {
  test('callers asking while a check runs share it: the stores are asked once', async () => {
    let finish: (games: string[]) => void = () => undefined
    list().mockReturnValue(
      new Promise<string[]>((resolve) => {
        finish = resolve
      })
    )

    const first = invokeHandler('checkGameUpdates')
    const second = invokeHandler('checkGameUpdates')
    finish(['g1'])

    expect(await first).toEqual(['g1'])
    expect(await second).toEqual(['g1'])
    expect(list()).toHaveBeenCalledTimes(1)
  })

  test('a later check asks again: the answer is not kept', async () => {
    list().mockResolvedValue([])

    await invokeHandler('checkGameUpdates')
    await invokeHandler('checkGameUpdates')

    expect(list()).toHaveBeenCalledTimes(2)
  })

  test('a store whose helper gives output rakun does not know has nothing to update, and does not stop the check', async () => {
    list().mockRejectedValueOnce(new Error('nile list-updates: not the output'))

    expect(await invokeHandler('checkGameUpdates')).toEqual([])
  })

  test('a failed check does not stick: the next one runs', async () => {
    list().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(['g2'])

    await invokeHandler('checkGameUpdates')

    expect(await invokeHandler('checkGameUpdates')).toEqual(['g2'])
  })
})
