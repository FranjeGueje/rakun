import { EventEmitter } from 'events'
import { spawn } from 'child_process'
import { callRunner } from '../runner_call'
import { memoryLog, quoteIfNecessary } from '../utils'
import { createAbortController } from '../utils/aborthandler/aborthandler'

jest.mock('child_process', () => ({ spawn: jest.fn() }))
jest.mock('../utils', () => ({
  quoteIfNecessary: jest.fn((value: string) => value),
  errorHandler: jest.fn(),
  memoryLog: jest.fn(() => ({ push: jest.fn(), join: () => '' }))
}))
jest.mock('../logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  LogPrefix: { Legendary: 'Legendary' }
}))
jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: { legendary: { commandToArgsArray: jest.fn() } }
}))
jest.mock('../utils/aborthandler/aborthandler', () => ({
  createAbortController: jest.fn(() => new AbortController()),
  deleteAbortController: jest.fn()
}))

/** A program that ends at once, or that cannot even be run (`error`) */
function program({ error }: { error?: Error } = {}) {
  jest.mocked(spawn).mockImplementation((() => {
    const child = Object.assign(new EventEmitter(), {
      stdout: Object.assign(new EventEmitter(), { setEncoding: jest.fn() }),
      stderr: Object.assign(new EventEmitter(), { setEncoding: jest.fn() }),
      killed: false
    })
    setImmediate(() =>
      error ? child.emit('error', error) : child.emit('close', 0, null)
    )
    return child
  }) as never)
}

const runner = {
  name: 'legendary' as const,
  logPrefix: 'Legendary' as never,
  bin: 'legendary',
  dir: '/tmp/helpers'
}

// The config resets the mocks before each test: what they answer is set here
beforeEach(() => {
  jest.mocked(quoteIfNecessary).mockImplementation((value) => value)
  jest
    .mocked(memoryLog)
    .mockImplementation(() => ({ push: jest.fn(), join: () => '' }))
  jest
    .mocked(createAbortController)
    .mockImplementation(() => new AbortController())
})

describe('callRunner', () => {
  test('a helper that is not there says how to install it', async () => {
    program({
      error: Object.assign(new Error('spawn ./legendary ENOENT'), {
        code: 'ENOENT'
      })
    })

    const result = await callRunner(['--version'], runner, {})

    expect(result.error).toBeInstanceOf(Error)
    expect(result.stderr).toContain('/tmp/helpers/legendary')
    expect(result.stderr).toContain('rakunctl helpers update')
  })

  test('another failure keeps its own message', async () => {
    program({ error: Object.assign(new Error('EACCES'), { code: 'EACCES' }) })

    const result = await callRunner(['--version'], runner, {})

    expect(result.stderr).toContain('EACCES')
    expect(result.stderr).not.toContain('helpers update')
  })

  test('a program that ends well gives its output', async () => {
    program()

    const result = await callRunner(['--version'], runner, {})

    expect(result.error).toBeUndefined()
  })
})
