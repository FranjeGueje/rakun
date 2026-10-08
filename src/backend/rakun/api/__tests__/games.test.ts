import { invokeHandler } from 'backend/ipc'
import { sendGameStatusUpdate, isEpicServiceOffline } from 'backend/utils'
import { isOnline } from 'backend/online_monitor'
import { libraryManagerMap } from 'backend/storeManagers'
import { showDialogBoxModalAuto } from 'backend/dialog/dialog'
import { onGameRepaired } from 'backend/rakun/game_events'
import './../games'

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => false),
  watch: jest.fn()
}))
jest.mock('backend/config', () => ({ GlobalConfig: { get: jest.fn() } }))
jest.mock('backend/utils', () => ({
  isEpicServiceOffline: jest.fn(),
  sendGameStatusUpdate: jest.fn()
}))
jest.mock('backend/utils/uninstaller', () => ({
  uninstallGameCallback: jest.fn()
}))
jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend', Legendary: 'Legendary' }
}))
jest.mock('backend/rakun/known_fixes', () => ({ readKnownFixes: jest.fn() }))
jest.mock('backend/online_monitor', () => ({ isOnline: jest.fn() }))
jest.mock('backend/dialog/dialog', () => ({
  showDialogBoxModalAuto: jest.fn()
}))
jest.mock('backend/utils/aborthandler/aborthandler', () => ({
  callAbortController: jest.fn()
}))
jest.mock('backend/storeManagers', () => ({
  autoUpdate: jest.fn(),
  libraryManagerMap: {
    gog: { getGame: jest.fn() },
    legendary: { getGame: jest.fn() }
  }
}))
jest.mock('backend/storeManagers/legendary/constants', () => ({
  legendaryInstalled: '/tmp/installed.json'
}))
jest.mock('backend/rakun/game_events', () => ({ onGameRepaired: jest.fn() }))
jest.mock('../refresh', () => ({
  refreshingRunners: jest.fn(),
  startRefresh: jest.fn()
}))

const repair = jest.fn()
const importGame = jest.fn()
const statuses = () =>
  jest
    .mocked(sendGameStatusUpdate)
    .mock.calls.map(([update]) => (update as { status: string }).status)

// The config resets the mocks before each test: what they answer is set here
beforeEach(() => {
  jest.mocked(isOnline).mockReturnValue(true)
  jest.mocked(isEpicServiceOffline).mockResolvedValue(false)
  const game = { getGameInfo: () => ({ title: 'Game' }), repair, importGame }
  for (const runner of ['gog', 'legendary'] as const)
    jest
      .mocked(libraryManagerMap[runner].getGame)
      .mockReturnValue(game as never)
})

describe('repair', () => {
  test('with no network it does nothing', async () => {
    jest.mocked(isOnline).mockReturnValue(false)

    await invokeHandler('repair', 'g1', 'gog')

    expect(repair).not.toHaveBeenCalled()
    expect(sendGameStatusUpdate).not.toHaveBeenCalled()
  })

  test('when the repair works, the Steam integration is repeated and it ends with done', async () => {
    repair.mockResolvedValue({})

    await invokeHandler('repair', 'g1', 'gog')

    expect(onGameRepaired).toHaveBeenCalled()
    expect(statuses()).toEqual(['repairing', 'done'])
  })

  test('when the repair fails, Steam is not touched, and it ends with done', async () => {
    repair.mockResolvedValue({ error: 'verify failed' })

    await invokeHandler('repair', 'g1', 'gog')

    expect(onGameRepaired).not.toHaveBeenCalled()
    expect(statuses()).toEqual(['repairing', 'done'])
  })

  test('an exception ends with done too, so the game is not left busy', async () => {
    repair.mockRejectedValue(new Error('boom'))

    await invokeHandler('repair', 'g1', 'gog')

    expect(statuses()).toEqual(['repairing', 'done'])
  })
})

describe('importGame', () => {
  const args = {
    appName: 'g1',
    path: '/g/one',
    runner: 'gog',
    platform: 'windows'
  }
  const run = (extra: Record<string, unknown> = {}) =>
    invokeHandler('importGame', { ...args, ...extra })

  test('a good import answers done', async () => {
    importGame.mockResolvedValue({ stdout: '', stderr: '' })

    expect(await run()).toEqual({ status: 'done' })
    expect(importGame).toHaveBeenCalledWith('/g/one', 'windows')
    expect(statuses()).toEqual(['importing', 'done'])
  })

  test('an error of the store answers error, and the game is not left busy', async () => {
    importGame.mockResolvedValue({
      stdout: '',
      stderr: '',
      error: 'not a game folder'
    })

    expect(await run()).toEqual({ status: 'error' })
    expect(statuses()).toEqual(['importing', 'done'])
  })

  test('an abort is not a failure', async () => {
    importGame.mockResolvedValue({ stdout: '', stderr: '', abort: true })

    expect(await run()).toEqual({ status: 'done' })
  })

  test('an exception answers error', async () => {
    importGame.mockRejectedValue(new Error('boom'))

    expect(await run()).toEqual({ status: 'error' })
    expect(statuses()).toEqual(['importing', 'done'])
  })

  test('Epic with its servers down is refused with a warning, before importing', async () => {
    jest.mocked(isEpicServiceOffline).mockResolvedValue(true)

    expect(await run({ runner: 'legendary' })).toEqual({ status: 'error' })
    expect(showDialogBoxModalAuto).toHaveBeenCalled()
    expect(importGame).not.toHaveBeenCalled()
  })
})
