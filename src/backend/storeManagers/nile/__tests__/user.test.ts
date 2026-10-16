import { NileUser } from '../user'
import { configStore } from '../electronStores'
import { logError } from 'backend/logger'
import { existsSync, readFileSync } from 'fs'

jest.mock('backend/logger', () => ({
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Nile: 'Nile' }
}))

jest.mock('backend/utils')

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}))

jest.mock('../electronStores', () => ({
  configStore: { get_nodefault: jest.fn(), delete: jest.fn(), set: jest.fn() }
}))

jest.mock('../constants', () => ({
  nileUserData: '/tmp/user.json'
}))

jest.mock('../..', () => ({
  libraryManagerMap: {
    nile: {
      runRunnerCommand: jest.fn()
    }
  }
}))

import { libraryManagerMap } from '../..'
const mockedRunRunnerCommand = jest.mocked(
  libraryManagerMap.nile.runRunnerCommand
)

describe('NileUser.getLoginData', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should throw when stdout is empty', async () => {
    mockedRunRunnerCommand.mockResolvedValue({
      stdout: '',
      stderr: 'ERROR: auth failed',
      error: undefined,
      abort: false
    })

    await expect(NileUser.getLoginData()).rejects.toThrow(
      'Empty response from nile auth command'
    )
  })

  it('should return login data when stdout has valid JSON', async () => {
    const loginData = {
      code: 'abc123',
      code_verifier: 'verifier',
      serial: 'serial123',
      client_id: 'client'
    }

    mockedRunRunnerCommand.mockResolvedValue({
      stdout: JSON.stringify(loginData),
      stderr: '',
      error: undefined,
      abort: false
    })

    const result = await NileUser.getLoginData()
    expect(result).toEqual(loginData)
  })
})

describe('NileUser.getUserData', () => {
  test('no user file is a normal state, not an error', () => {
    expect(NileUser.getUserData()).toBeUndefined()

    expect(logError).not.toHaveBeenCalled()
    expect(configStore.delete).toHaveBeenCalledWith('userData')
  })
})

describe('NileUser.logout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('forgets the stored user once nile has logged out', async () => {
    mockedRunRunnerCommand.mockResolvedValue({ stdout: '', stderr: '' })

    await NileUser.logout()

    expect(configStore.delete).toHaveBeenCalledWith('userData')
  })

  it.each([
    ['fails', { error: 'boom' }],
    ['is aborted', { abort: true }]
  ])(
    'says so when the command %s, and keeps the session as it was',
    async (_, result) => {
      mockedRunRunnerCommand.mockResolvedValue({
        stdout: '',
        stderr: '',
        ...result
      })

      await expect(NileUser.logout()).rejects.toThrow(
        'Could not log out of Amazon'
      )
      expect(configStore.delete).not.toHaveBeenCalled()
    }
  )
})

describe('NileUser.getUserData', () => {
  beforeEach(() => {
    jest.mocked(existsSync).mockReturnValue(true)
  })

  it('reads the user nile saved', () => {
    jest
      .mocked(readFileSync)
      .mockReturnValue('{"name":"Fco","user_id":"u1"}' as never)

    expect(NileUser.getUserData()).toEqual({ name: 'Fco', user_id: 'u1' })
    expect(configStore.set).toHaveBeenCalledWith('userData', expect.anything())
  })

  it('a file that cannot be read does not log anybody out: what was known stays', () => {
    jest.mocked(readFileSync).mockReturnValue('{"name":"Fc' as never)
    jest.mocked(configStore.get_nodefault).mockReturnValue({ name: 'Fco' })

    expect(NileUser.getUserData()).toEqual({ name: 'Fco' })
    expect(configStore.delete).not.toHaveBeenCalled()
  })

  it.each([['null'], ['{}']])(
    'a file with %s in it means nobody',
    (content) => {
      jest.mocked(readFileSync).mockReturnValue(content as never)

      expect(NileUser.getUserData()).toBeUndefined()
      expect(configStore.delete).toHaveBeenCalledWith('userData')
    }
  )
})

describe('NileUser.login', () => {
  const data = {
    url: 'u',
    code: 'CODE123',
    code_verifier: 'VERIFIER456',
    serial: 'SERIAL789',
    client_id: 'CLIENT000'
  }

  beforeEach(() => {
    jest.mocked(existsSync).mockReturnValue(true)
    jest
      .mocked(readFileSync)
      .mockReturnValue('{"name":"Fco","user_id":"u1"}' as never)
  })

  it.each([['Succesfully'], ['Successfully']])(
    'accepts nile saying %s, however it spells it',
    async (word) => {
      mockedRunRunnerCommand.mockResolvedValue({
        stdout: '',
        stderr: `INFO [AUTH_MANAGER]:\t ${word} registered a device`,
        code: 0
      })

      expect((await NileUser.login(data)).status).toBe('done')
    }
  )

  it('is not a login when nile ended with an error code, whatever it printed', async () => {
    mockedRunRunnerCommand.mockResolvedValue({
      stdout: '',
      stderr: 'INFO [AUTH_MANAGER]:\t Succesfully registered a device',
      code: 1
    })

    expect((await NileUser.login(data)).status).toBe('failed')
  })

  it('a failed login does not put what was sent in the log', async () => {
    mockedRunRunnerCommand.mockResolvedValue({
      stdout: '',
      stderr:
        'ERROR: bad request for code CODE123 verifier VERIFIER456 serial SERIAL789 client CLIENT000',
      code: 1
    })

    await NileUser.login(data)

    const logged = JSON.stringify(jest.mocked(logError).mock.calls)
    for (const secret of ['CODE123', 'VERIFIER456', 'SERIAL789', 'CLIENT000'])
      expect(logged).not.toContain(secret)
  })
})
