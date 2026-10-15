jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Itch: 'Itch' }
}))
jest.mock('../user', () => ({
  ItchUser: { login: jest.fn() },
  loginErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error)
}))

import { ItchUser } from '../user'
import {
  cancelItchLogin,
  completeItchLogin,
  loginFromPaste,
  startItchLogin
} from '../login'

const login = jest.mocked(ItchUser.login)

const stateOf = (url: string) => new URL(url).searchParams.get('state')!
const tokenReply = (body: unknown = { access_token: 'TOKEN' }, ok = true) =>
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(body)
  } as Response)

afterEach(() => jest.restoreAllMocks())
beforeEach(() => login.mockReset().mockResolvedValue(undefined))

describe('startItchLogin', () => {
  test('gives the address to open and says the browser comes back by itself', () => {
    const info = startItchLogin(17370)

    expect(info.runner).toBe('itch')
    expect(info.callback).toBe(true)
    expect(info.url).toContain('https://itch.io/user/oauth?')
    expect(new URL(info.url).searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:17370/itch/callback'
    )
  })
})

describe('the two ways to log in', () => {
  test('the first is the link that allows the minimum permissions, with nothing to paste', () => {
    const info = startItchLogin(17370)
    expect(info.url).toContain('https://itch.io/user/oauth?')
    expect(info.instructions).toMatch(/library/i)
    expect(info.instructions).toMatch(/minimum permissions/)
    expect(info.callback).toBe(true)
  })

  test('the second is the page of the API keys, for the library and the collections', () => {
    const { alternative } = startItchLogin(17370)
    expect(alternative?.url).toBe('https://itch.io/user/settings/api-keys')
    expect(alternative?.instructions).toMatch(/collections/)
    expect(alternative?.instructions).toMatch(/paste/)
    expect(alternative?.instructions).toMatch(/full access/)
  })
})

describe('completeItchLogin', () => {
  test('trades the code and logs in with the token, remembering it is an OAuth one', async () => {
    const fetchSpy = tokenReply()
    const state = stateOf(startItchLogin(17370).url)

    await completeItchLogin('CODE', state)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(login).toHaveBeenCalledWith('TOKEN', true)
  })

  test('refuses another state and does not even ask itch.io', async () => {
    const fetchSpy = tokenReply()
    startItchLogin(17370)

    await expect(completeItchLogin('CODE', 'forged')).rejects.toThrow(
      'not the one rakun started'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(login).not.toHaveBeenCalled()
  })

  test('refuses a callback with no state, and one with no login started', async () => {
    tokenReply()
    const state = stateOf(startItchLogin(17370).url)
    await expect(completeItchLogin('CODE', undefined)).rejects.toThrow()
    await expect(completeItchLogin('CODE', `${state}x`)).rejects.toThrow()
    cancelItchLogin(state)
    await expect(completeItchLogin('CODE', state)).rejects.toThrow()
  })

  test('a state works once: a second callback with it is refused', async () => {
    tokenReply()
    const state = stateOf(startItchLogin(17370).url)

    await completeItchLogin('CODE', state)
    await expect(completeItchLogin('CODE', state)).rejects.toThrow(
      'not the one rakun started'
    )
    expect(login).toHaveBeenCalledTimes(1)
  })

  test('a callback with a made-up state does not spend the login: the real one still works', async () => {
    tokenReply()
    const state = stateOf(startItchLogin(17370).url)

    await expect(completeItchLogin('CODE', 'forged')).rejects.toThrow()
    await completeItchLogin('CODE', state)

    expect(login).toHaveBeenCalledWith('TOKEN', true)
  })

  test('starting a login again replaces the old one', async () => {
    tokenReply()
    const first = stateOf(startItchLogin(17370).url)
    const second = stateOf(startItchLogin(17370).url)

    await expect(completeItchLogin('CODE', first)).rejects.toThrow()
    startItchLogin(17370)
    await expect(completeItchLogin('CODE', second)).rejects.toThrow()
  })

  test('when itch.io gives no token nobody is logged in', async () => {
    tokenReply({ error: 'invalid_grant' }, false)
    const state = stateOf(startItchLogin(17370).url)

    await expect(completeItchLogin('CODE', state)).rejects.toThrow(
      'invalid_grant'
    )
    expect(login).not.toHaveBeenCalled()
  })
})

describe('cancelItchLogin', () => {
  test('forgets the login when itch.io says the user refused', async () => {
    tokenReply()
    const state = stateOf(startItchLogin(17370).url)

    cancelItchLogin(state)

    await expect(completeItchLogin('CODE', state)).rejects.toThrow()
  })

  test('a refusal with a state that is not ours leaves the login alone', async () => {
    tokenReply()
    const state = stateOf(startItchLogin(17370).url)

    cancelItchLogin('forged')

    await completeItchLogin('CODE', state)
    expect(login).toHaveBeenCalledWith('TOKEN', true)
  })
})

describe('loginFromPaste', () => {
  test('the address the browser ended on completes the OAuth login', async () => {
    tokenReply()
    const state = stateOf(startItchLogin(17370).url)

    const result = await loginFromPaste(
      'CODE',
      `http://127.0.0.1:17370/itch/callback?code=CODE&state=${state}`
    )

    expect(result).toEqual({ ok: true })
    expect(login).toHaveBeenCalledWith('TOKEN', true)
  })

  test('an address with a state that is not ours is refused', async () => {
    tokenReply()
    startItchLogin(17370)

    const result = await loginFromPaste(
      'CODE',
      'http://127.0.0.1:17370/itch/callback?code=CODE&state=forged'
    )

    expect(result.ok).toBe(false)
    expect(login).not.toHaveBeenCalled()
  })

  test('a bare token is an API key: butler gets it as it is, not as an OAuth login', async () => {
    const fetchSpy = tokenReply()

    expect(await loginFromPaste('APIKEY')).toEqual({ ok: true })

    expect(login).toHaveBeenCalledWith('APIKEY')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('what butler refuses comes back as the error', async () => {
    login.mockRejectedValue(new Error('invalid key'))
    expect(await loginFromPaste('BAD')).toEqual({
      ok: false,
      error: 'invalid key'
    })
  })
})
