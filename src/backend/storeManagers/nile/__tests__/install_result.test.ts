// What Amazon install does with each way nile can end. Success means nile
// recorded the install, whatever its exit code said
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
const getInstallMetadata = jest.fn()
const installState = jest.fn()

beforeEach(() => {
  runRunnerCommand.mockReset()
  getInstallMetadata.mockReset()
  installState.mockReset()
  ;(libraryManagerMap as Record<string, unknown>)['nile'] = {
    runRunnerCommand,
    getInstallMetadata,
    installState
  }
})

const install = () => new NileGame('g1').install({ path: '/games' } as never)

describe('NileGame.install and the way nile ends', () => {
  test('it ended well and nile recorded it: done', async () => {
    runRunnerCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
    getInstallMetadata.mockReturnValue({ id: 'g1' })

    expect(await install()).toEqual({ status: 'done' })
    expect(installState).toHaveBeenCalledWith('g1', true)
  })

  test('a code other than 0 is an error, and nothing is marked installed', async () => {
    runRunnerCommand.mockResolvedValue({
      stdout: '',
      stderr: 'Not enough space available',
      code: 1
    })

    const result = await install()

    expect(result.status).toBe('error')
    expect(result.error).toContain('Not enough space')
    expect(installState).not.toHaveBeenCalled()
  })

  test('exit 0 but nile recorded nothing: an error, not a game that is not there', async () => {
    runRunnerCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
    getInstallMetadata.mockReturnValue(undefined)

    const result = await install()

    expect(result.status).toBe('error')
    expect(installState).not.toHaveBeenCalled()
  })

  test('exit 0 but nile said a checksum did not match: an error, nothing marked installed', async () => {
    runRunnerCommand.mockImplementation(
      (_: string[], options: { onOutput: (data: string) => void }) => {
        options.onOutput('Checksum error for /games/Game/game.exe\n')
        return Promise.resolve({ stdout: '', stderr: '', code: 0 })
      }
    )
    getInstallMetadata.mockReturnValue({ id: 'g1' })

    const result = await install()

    expect(result.status).toBe('error')
    expect(result.error).toContain('Checksum error for /games/Game/game.exe')
    expect(installState).not.toHaveBeenCalled()
  })

  test('stopped on purpose is an abort', async () => {
    runRunnerCommand.mockResolvedValue({ stdout: '', stderr: '', abort: true })

    expect(await install()).toEqual({ status: 'abort' })
  })
})
