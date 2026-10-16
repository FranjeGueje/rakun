import axios from 'axios'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { configStore } from '../electronStores'
import { isOnline } from '../../../online_monitor'
import { ZoomUser } from '../user'
import {
  clearSessionExpired,
  isSessionExpired,
  markSessionExpired
} from '../../session_state'

jest.mock('axios')
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  chmodSync: jest.fn(),
  existsSync: jest.fn(),
  readFileSync: jest.fn(() => 'a-token'),
  unlinkSync: jest.fn(),
  writeFileSync: jest.fn()
}))
jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Zoom: 'Zoom' }
}))
jest.mock('../electronStores', () => ({
  configStore: { get: jest.fn(), set: jest.fn(), clear: jest.fn() }
}))
jest.mock('../../../online_monitor', () => ({ isOnline: jest.fn() }))
jest.mock('backend/utils', () => ({ clearCache: jest.fn() }))
jest.mock('../constants', () => ({
  tokenPath: '/tmp/zoom.token',
  apiUrl: 'https://api.test',
  embedUrl: 'https://embed.test'
}))

const mockedAxios = jest.mocked(axios)
const mockedExistsSync = jest.mocked(existsSync)
const mockedReadFileSync = jest.mocked(readFileSync)
const mockedUnlinkSync = jest.mocked(unlinkSync)
const mockedConfigStore = jest.mocked(configStore)
const mockedIsOnline = jest.mocked(isOnline)

function axiosError(status?: number) {
  return Object.assign(new Error('request failed'), {
    response: status === undefined ? undefined : { status }
  })
}

beforeEach(() => {
  clearSessionExpired('zoom')
  // The backend jest config sets resetMocks, which also wipes implementations
  // given in the jest.mock() factories -- so every one of them belongs here
  mockedExistsSync.mockReturnValue(true)
  mockedReadFileSync.mockReturnValue('a-token')
  mockedIsOnline.mockReturnValue(true)
  mockedConfigStore.get.mockReturnValue(true)
  mockedAxios.get.mockResolvedValue({ data: { name: 'someone' } })

  // Drop the module-level verification window left by the previous test
  ZoomUser.logout()
  jest.clearAllMocks()
})

describe('ZoomUser.getUserDetails', () => {
  test('verifies the login with a single request', async () => {
    // It used to call isLoggedIn() -- itself a network check against
    // /li/loggedin -- and then request the very same endpoint again
    await expect(ZoomUser.getUserDetails()).resolves.toEqual({
      username: 'someone'
    })

    expect(mockedAxios.get).toHaveBeenCalledTimes(1)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.test/li/loggedin',
      expect.anything()
    )
  })

  test('its verification lets a following isLoggedIn() skip the network', async () => {
    await ZoomUser.getUserDetails()
    await expect(ZoomUser.isLoggedIn()).resolves.toBe(true)

    expect(mockedAxios.get).toHaveBeenCalledTimes(1)
  })

  test('returns nothing when there is no token', async () => {
    mockedExistsSync.mockReturnValue(false)

    await expect(ZoomUser.getUserDetails()).resolves.toBeUndefined()
    expect(mockedAxios.get).not.toHaveBeenCalled()
  })
})

describe('ZoomUser.isLoggedIn', () => {
  test('asks Zoom once and reuses the answer', async () => {
    await expect(ZoomUser.isLoggedIn()).resolves.toBe(true)
    await expect(ZoomUser.isLoggedIn()).resolves.toBe(true)
    await expect(ZoomUser.isLoggedIn()).resolves.toBe(true)

    expect(mockedAxios.get).toHaveBeenCalledTimes(1)
  })

  test('concurrent callers share one request', async () => {
    let release: (value: unknown) => void = () => undefined
    mockedAxios.get.mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      })
    )

    const calls = [ZoomUser.isLoggedIn(), ZoomUser.isLoggedIn()]
    release({ data: {} })
    await Promise.all(calls)

    expect(mockedAxios.get).toHaveBeenCalledTimes(1)
  })

  test('does not touch the network without a token', async () => {
    mockedExistsSync.mockReturnValue(false)

    await expect(ZoomUser.isLoggedIn()).resolves.toBe(false)
    expect(mockedAxios.get).not.toHaveBeenCalled()
  })

  test('trusts the stored state while offline', async () => {
    mockedIsOnline.mockReturnValue(false)

    await expect(ZoomUser.isLoggedIn()).resolves.toBe(true)
    expect(mockedAxios.get).not.toHaveBeenCalled()
  })
})

describe('ZoomUser - failures must not destroy the session', () => {
  test('a network error keeps the token', async () => {
    // A dropped connection used to log the user out and delete their token
    mockedAxios.get.mockRejectedValue(axiosError())

    await expect(ZoomUser.isLoggedIn()).resolves.toBe(true)
    expect(mockedUnlinkSync).not.toHaveBeenCalled()
    expect(mockedConfigStore.clear).not.toHaveBeenCalled()
  })

  test('a server error keeps the token', async () => {
    mockedAxios.get.mockRejectedValue(axiosError(500))

    await expect(ZoomUser.isLoggedIn()).resolves.toBe(true)
    expect(mockedUnlinkSync).not.toHaveBeenCalled()
  })

  test.each([401, 403])(
    'a %s from Zoom marks the session expired, and keeps the token',
    async (status) => {
      mockedAxios.get.mockRejectedValue(axiosError(status))

      await expect(ZoomUser.isLoggedIn()).resolves.toBe(false)
      expect(isSessionExpired('zoom')).toBe(true)
      expect(mockedUnlinkSync).not.toHaveBeenCalled()
      expect(mockedConfigStore.clear).not.toHaveBeenCalled()
    }
  )

  test('a good answer from Zoom clears the mark', async () => {
    markSessionExpired('zoom')
    mockedAxios.get.mockResolvedValue({ data: { name: 'di' } })

    await ZoomUser.isLoggedIn()

    expect(isSessionExpired('zoom')).toBe(false)
  })

  test('a failed verification is not remembered as a success', async () => {
    mockedAxios.get.mockRejectedValue(axiosError())
    await ZoomUser.isLoggedIn()

    mockedAxios.get.mockResolvedValue({ data: {} })
    await ZoomUser.isLoggedIn()

    expect(mockedAxios.get).toHaveBeenCalledTimes(2)
  })
})

describe('ZoomUser.loginVerified', () => {
  const url = 'https://www.zoom-platform.com/?li_token=new-token'
  const tokenWrites = () =>
    jest.mocked(writeFileSync).mock.calls.map(([, content]) => content)

  test('Zoom accepts the token: it is kept', async () => {
    await expect(ZoomUser.loginVerified(url)).resolves.toEqual({
      status: 'done'
    })

    expect(tokenWrites()).toEqual(['new-token'])
    expect(isSessionExpired('zoom')).toBe(false)
  })

  test('Zoom refuses it (401): the token that was working is put back', async () => {
    // 'a-token' is what the file held
    mockedAxios.get.mockRejectedValue(axiosError(401))

    await expect(ZoomUser.loginVerified(url)).resolves.toEqual({
      status: 'rejected'
    })

    expect(tokenWrites()).toEqual(['new-token', 'a-token'])
    expect(isSessionExpired('zoom')).toBe(false)
  })

  test('Zoom refuses it and there was no session: the new token goes, nothing is left', async () => {
    mockedAxios.get.mockRejectedValue(axiosError(403))
    mockedExistsSync.mockReturnValueOnce(false).mockReturnValue(true)

    await expect(ZoomUser.loginVerified(url)).resolves.toEqual({
      status: 'rejected'
    })

    expect(mockedUnlinkSync).toHaveBeenCalledWith('/tmp/zoom.token')
  })

  test('the session was already expired and the new token is refused too: still expired', async () => {
    markSessionExpired('zoom')
    mockedAxios.get.mockRejectedValue(axiosError(401))

    await ZoomUser.loginVerified(url)

    expect(isSessionExpired('zoom')).toBe(true)
  })

  test('Zoom cannot be reached: nothing says the token is wrong, it stays', async () => {
    mockedAxios.get.mockRejectedValue(axiosError())

    await expect(ZoomUser.loginVerified(url)).resolves.toEqual({
      status: 'done'
    })

    expect(tokenWrites()).toEqual(['new-token'])
    expect(isSessionExpired('zoom')).toBe(false)
  })

  test('an address with no token is an error and touches nothing', async () => {
    await expect(
      ZoomUser.loginVerified('https://www.zoom-platform.com/')
    ).resolves.toEqual({ status: 'error' })

    expect(tokenWrites()).toEqual([])
  })
})
