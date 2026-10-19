// What update answers when the nile command ends in each way: the queue reads
// «abort» as a pause or a cancel, and «error» as a failure to show
jest.mock('backend/logger', () => ({
  LogPrefix: { Nile: 'Nile' },
  createGameLogWriter: jest.fn(),
  logDebug: jest.fn(),
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn()
}))
jest.mock('backend/utils', () => ({
  killPattern: jest.fn(),
  moveOnUnix: jest.fn(),
  sendProgressUpdate: jest.fn()
}))
jest.mock('backend/config', () => ({
  GlobalConfig: { get: () => ({ getSettings: () => ({ maxWorkers: 0 }) }) }
}))
jest.mock('backend/ipc', () => ({ sendFrontendMessage: jest.fn() }))
jest.mock('../stores', () => ({
  installStore: { get: jest.fn(), set: jest.fn() },
  libraryStore: { get: jest.fn(), set: jest.fn() }
}))
jest.mock('../../index', () => ({ libraryManagerMap: {} }))
jest.mock('../user', () => ({ NileUser: {} }))

import { libraryManagerMap } from '../../index'
import NileGame from '../games'

const runRunnerCommand = jest.fn()

beforeEach(() => {
  runRunnerCommand.mockReset()
  ;(libraryManagerMap as Record<string, unknown>)['nile'] = { runRunnerCommand }
})

describe('NileGame.update', () => {
  test('a command that ended well is done', async () => {
    runRunnerCommand.mockResolvedValue({ stdout: '', stderr: '' })

    expect(await new NileGame('g1').update()).toEqual({ status: 'done' })
  })

  test('an abort (pause or cancel) is abort, not done', async () => {
    runRunnerCommand.mockResolvedValue({ stdout: '', stderr: '', abort: true })

    expect(await new NileGame('g1').update()).toEqual({ status: 'abort' })
  })

  test('an error is an error with its reason', async () => {
    runRunnerCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      error: 'disk full'
    })

    expect(await new NileGame('g1').update()).toEqual({
      status: 'error',
      error: 'disk full'
    })
  })

  test('a code other than 0 is an error even when nothing said ERROR', async () => {
    runRunnerCommand.mockResolvedValue({
      stdout: '',
      stderr: 'usage: helper update [-h]',
      code: 2
    })

    const result = await new NileGame('g1').update()

    expect(result.status).toBe('error')
    expect(result.error).toContain('code 2')
  })

  test('exit 0 is done, as before', async () => {
    runRunnerCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })

    expect(await new NileGame('g1').update()).toEqual({ status: 'done' })
  })
})
