import { EventEmitter } from 'events'
import { spawn } from 'child_process'
import { logError } from 'backend/logger'
import { openExternal } from '../open_external'

jest.mock('child_process', () => ({ spawn: jest.fn() }))
jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

const mockedSpawn = jest.mocked(spawn)
const mockedLogError = jest.mocked(logError)

/** Each opener, in the order they are run, ends like this: an exit code, or `missing` (not installed) */
function openers(...outcomes: (number | 'missing')[]) {
  for (const outcome of outcomes)
    mockedSpawn.mockImplementationOnce((() => {
      const child = new EventEmitter()
      setImmediate(() =>
        outcome === 'missing'
          ? child.emit('error', new Error('ENOENT'))
          : child.emit('close', outcome)
      )
      return child
    }) as never)
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('openExternal', () => {
  test('hands the target to gio open first', async () => {
    openers(0)

    await expect(openExternal('steam://gameproperties/42')).resolves.toBe(true)

    expect(mockedSpawn).toHaveBeenCalledTimes(1)
    expect(mockedSpawn).toHaveBeenCalledWith(
      'gio',
      ['open', 'steam://gameproperties/42'],
      { stdio: 'ignore' }
    )
    expect(mockedLogError).not.toHaveBeenCalled()
  })

  test('falls back to xdg-open when gio is not installed', async () => {
    openers('missing', 0)

    await expect(openExternal('/home/user/Games')).resolves.toBe(true)

    expect(mockedSpawn).toHaveBeenLastCalledWith(
      'xdg-open',
      ['/home/user/Games'],
      { stdio: 'ignore' }
    )
    expect(mockedLogError).not.toHaveBeenCalled()
  })

  test('falls back to xdg-open when gio fails', async () => {
    openers(4, 0)

    await expect(openExternal('https://example.com')).resolves.toBe(true)
    expect(mockedSpawn).toHaveBeenCalledTimes(2)
  })

  test('answers false and logs once when neither works, without rejecting', async () => {
    openers(1, 'missing')

    await expect(openExternal('/nope')).resolves.toBe(false)

    expect(mockedLogError).toHaveBeenCalledTimes(1)
    expect(mockedLogError).toHaveBeenCalledWith(
      expect.stringContaining('Could not open "/nope"'),
      'Backend'
    )
  })
})
