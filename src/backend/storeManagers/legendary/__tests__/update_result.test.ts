// What update answers when the legendary command ends in each way: the queue
// reads «abort» as a pause or a cancel, and «error» as a failure to show
jest.mock('backend/logger', () => ({
  LogPrefix: { Legendary: 'Legendary' },
  createGameLogWriter: jest.fn(),
  logDebug: jest.fn(),
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn()
}))
jest.mock('../../../utils', () => ({
  killPattern: jest.fn(),
  moveOnUnix: jest.fn(),
  sendGameStatusUpdate: jest.fn(),
  sendProgressUpdate: jest.fn(),
  getFileSize: jest.fn()
}))
jest.mock('../../../config', () => ({
  GlobalConfig: { get: () => ({ getSettings: () => ({ maxWorkers: 0 }) }) }
}))
jest.mock('../../../ipc', () => ({ sendFrontendMessage: jest.fn() }))
jest.mock('../../../online_monitor', () => ({ isOnline: jest.fn() }))
jest.mock('../electronStores', () => ({
  gameInfoStore: { get: jest.fn(), set: jest.fn() },
  installStore: { get: jest.fn(), set: jest.fn() },
  libraryStore: { get: jest.fn(), set: jest.fn() }
}))
jest.mock('../../index', () => ({ libraryManagerMap: {} }))
jest.mock('../user', () => ({ LegendaryUser: {} }))
jest.mock('../constants', () => ({ legendaryInstalled: '/tmp/installed.json' }))

import { libraryManagerMap } from '../../index'
import LegendaryGame from '../games'
import type { LegendaryAppName } from '../commands/base'

const runRunnerCommand = jest.fn()

beforeEach(() => {
  runRunnerCommand.mockReset()
  ;(libraryManagerMap as Record<string, unknown>)['legendary'] = {
    runRunnerCommand,
    getInstallInfo: jest.fn().mockResolvedValue({ manifest: {} })
  }
})

const game = () => {
  const legendary = new LegendaryGame('g1' as LegendaryAppName)
  legendary.getGameInfo = jest
    .fn()
    .mockReturnValue({ install: { platform: 'Windows' } })
  return legendary
}

describe('LegendaryGame.update', () => {
  test('a command that ended well is done', async () => {
    runRunnerCommand.mockResolvedValue({ stdout: '', stderr: '' })

    expect(await game().update()).toEqual({ status: 'done' })
  })

  test('an abort (pause or cancel) is abort, not done', async () => {
    runRunnerCommand.mockResolvedValue({ stdout: '', stderr: '', abort: true })

    expect(await game().update()).toEqual({ status: 'abort' })
  })

  test('an error is an error with its reason', async () => {
    runRunnerCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      error: 'disk full'
    })

    expect(await game().update()).toEqual({
      status: 'error',
      error: 'disk full'
    })
  })

  test('it no longer sends the done status itself: the queue does', async () => {
    const { sendGameStatusUpdate } = jest.requireMock('../../../utils')
    runRunnerCommand.mockResolvedValue({ stdout: '', stderr: '' })

    await game().update()

    const statuses = sendGameStatusUpdate.mock.calls.map(
      ([update]: [{ status: string }]) => update.status
    )
    expect(statuses).toEqual(['updating'])
  })
})
