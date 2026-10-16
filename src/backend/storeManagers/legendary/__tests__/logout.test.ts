jest.mock('backend/logger', () => ({
  LogPrefix: { Legendary: 'Legendary' },
  logDebug: jest.fn(),
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn()
}))
jest.mock('backend/utils', () => ({ clearCache: jest.fn() }))
jest.mock('../../../utils', () => ({ clearCache: jest.fn() }))
jest.mock('../../index', () => ({ libraryManagerMap: {} }))
jest.mock('../constants', () => ({
  legendaryUserInfo: '/tmp/none/user.json',
  legendaryConfigPath: '/tmp/none'
}))

import { clearCache } from '../../../utils'
import { libraryManagerMap } from '../../index'
import { LegendaryUser } from '../user'

const runRunnerCommand = jest.fn()

beforeEach(() => {
  runRunnerCommand.mockReset()
  ;(libraryManagerMap as Record<string, unknown>)['legendary'] = {
    runRunnerCommand
  }
})

describe('LegendaryUser.logout', () => {
  test('after `auth --delete` worked, the caches are cleared', async () => {
    runRunnerCommand.mockResolvedValue({ stdout: '', stderr: '' })

    await LegendaryUser.logout()

    expect(clearCache).toHaveBeenCalledWith('legendary')
  })

  test.each([
    ['fails', { error: 'boom' }],
    ['is aborted', { abort: true }]
  ])(
    'says so when the command %s, and does not clear anything',
    async (_, result) => {
      runRunnerCommand.mockResolvedValue({ stdout: '', stderr: '', ...result })

      await expect(LegendaryUser.logout()).rejects.toThrow(
        'Could not log out of Epic'
      )
      expect(clearCache).not.toHaveBeenCalled()
    }
  )
})

describe('LegendaryUser.login', () => {
  const info = { account_id: 'a1', displayName: 'Ann', user: 'deck' }

  test('legendary saved a session: logged in', async () => {
    runRunnerCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
    jest.spyOn(LegendaryUser, 'getUserInfo').mockReturnValue(info)

    expect(await LegendaryUser.login('CODE')).toEqual({
      status: 'done',
      data: info
    })
  })

  test('it said nothing wrong but left no session (or an old one gone): not logged in', async () => {
    runRunnerCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
    jest.spyOn(LegendaryUser, 'getUserInfo').mockReturnValue(undefined)

    expect((await LegendaryUser.login('CODE')).status).toBe('failed')
  })

  test('a code other than 0 is a failed login', async () => {
    runRunnerCommand.mockResolvedValue({
      stdout: '',
      stderr: 'something else',
      code: 1
    })
    jest.spyOn(LegendaryUser, 'getUserInfo').mockReturnValue(info)

    expect((await LegendaryUser.login('CODE')).status).toBe('failed')
  })
})
