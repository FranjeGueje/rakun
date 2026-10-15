jest.mock('../constants', () => ({
  ITCH_AUTHORIZE_URL: 'https://itch.io/user/oauth',
  ITCH_CALLBACK_PATH: '/itch/callback',
  ITCH_CLIENT_ID: 'client-1',
  ITCH_LOGIN_TTL_MS: 1000,
  ITCH_REVOKE_URL: 'https://api.itch.io/oauth/revoke',
  ITCH_SCOPE: 'profile',
  ITCH_TOKEN_URL: 'https://api.itch.io/oauth/token'
}))

import {
  authorizeUrl,
  challengeOf,
  exchangeCode,
  matchesPending,
  newPendingLogin,
  newState,
  newVerifier,
  parseCallback,
  redirectUriFor,
  revokeToken
} from '../oauth'

const reply = (body: unknown, ok = true, status = 200) =>
  jest.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) })

describe('the permissions asked for', () => {
  // The real list, not the mocked one of this file
  const { ITCH_SCOPE, ITCH_SCOPES } = jest.requireActual('../constants')

  test('are the ones the library and the installs need', () => {
    expect(ITCH_SCOPES).toEqual(
      expect.arrayContaining([
        'profile:me',
        'profile:owned',
        'profile:collections',
        'collection:view',
        'game:view',
        'game:view:uploads'
      ])
    )
  })

  test('never the whole `profile`, nor anything that edits', () => {
    expect(ITCH_SCOPES).not.toContain('profile')
    expect(ITCH_SCOPES).not.toContain('profile:games')
    expect(ITCH_SCOPES.filter((scope: string) => /edit/.test(scope))).toEqual(
      []
    )
  })

  test('are written separated by spaces, once each', () => {
    expect(ITCH_SCOPE.split(' ')).toEqual(ITCH_SCOPES)
    expect(new Set(ITCH_SCOPES).size).toBe(ITCH_SCOPES.length)
  })
})

describe('PKCE', () => {
  test('the challenge is the S256 of the verifier (the example of RFC 7636)', () => {
    expect(challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    )
  })

  test('a verifier is 43 to 128 characters of the unreserved alphabet, and never repeats', () => {
    const verifier = newVerifier()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
    expect(newVerifier()).not.toBe(verifier)
  })

  test('a state is random and url safe', () => {
    expect(newState()).toMatch(/^[A-Za-z0-9_-]{20,}$/)
    expect(newState()).not.toBe(newState())
  })
})

describe('the login address', () => {
  test('goes back to rakun, in loopback, on the port of its API', () => {
    expect(redirectUriFor(17370)).toBe('http://127.0.0.1:17370/itch/callback')
  })

  test('carries the client, the scope, the challenge, the state and where to come back', () => {
    const pending = newPendingLogin(17999)
    const url = new URL(authorizeUrl(pending))

    expect(`${url.origin}${url.pathname}`).toBe('https://itch.io/user/oauth')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'client-1',
      scope: 'profile',
      response_type: 'code',
      code_challenge: challengeOf(pending.verifier),
      code_challenge_method: 'S256',
      state: pending.state,
      redirect_uri: 'http://127.0.0.1:17999/itch/callback'
    })
  })

  test('never shows the verifier, only its challenge', () => {
    const pending = newPendingLogin(1)
    expect(authorizeUrl(pending)).not.toContain(pending.verifier)
  })
})

describe('matchesPending', () => {
  const pending = newPendingLogin(1, 0)

  test('accepts its own state', () => {
    expect(matchesPending(pending, pending.state, 10)).toBe(true)
  })

  test.each([
    ['another state', 'other'],
    ['a state of another length', 'x'],
    ['no state', undefined]
  ])('refuses %s', (_name, state) => {
    expect(matchesPending(pending, state, 10)).toBe(false)
  })

  test('refuses a login that took too long, and one that was never started', () => {
    expect(matchesPending(pending, pending.state, 1001)).toBe(false)
    expect(matchesPending(undefined, 'state', 0)).toBe(false)
  })
})

describe('parseCallback', () => {
  test('reads the code and the state of the address the browser ended on', () => {
    expect(
      parseCallback('http://127.0.0.1:17370/itch/callback?code=C&state=S\n')
    ).toEqual({ code: 'C', state: 'S', error: undefined })
  })

  test('reads a refusal', () => {
    expect(
      parseCallback(
        'http://127.0.0.1/itch/callback?error=access_denied&state=S'
      )
    ).toEqual({ code: undefined, state: 'S', error: 'access_denied' })
  })

  test('is nothing for what is not an address, such as a token', () => {
    expect(parseCallback('abcdef0123456789')).toBeUndefined()
  })
})

describe('exchangeCode', () => {
  const pending = newPendingLogin(17999)

  test('posts the code with the verifier and the same redirect, and returns the token', async () => {
    const fetchFn = reply({ access_token: 'TOKEN', token_type: 'bearer' })

    expect(await exchangeCode(pending, 'CODE', fetchFn)).toBe('TOKEN')

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.itch.io/oauth/token')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    )
    expect(Object.fromEntries(init.body)).toEqual({
      grant_type: 'authorization_code',
      code: 'CODE',
      code_verifier: pending.verifier,
      redirect_uri: 'http://127.0.0.1:17999/itch/callback',
      client_id: 'client-1'
    })
  })

  test('says why itch.io refused', async () => {
    const fetchFn = reply({ error: 'invalid_grant' }, false, 400)
    await expect(exchangeCode(pending, 'X', fetchFn)).rejects.toThrow(
      'invalid_grant'
    )
  })

  test('an answer with no token is a failure, whatever its status', async () => {
    await expect(exchangeCode(pending, 'X', reply({}))).rejects.toThrow(
      'did not give a token'
    )
  })
})

describe('revokeToken', () => {
  test('posts the token and the client', async () => {
    const fetchFn = reply({})
    await revokeToken('TOKEN', fetchFn)
    expect(fetchFn.mock.calls[0][0]).toBe('https://api.itch.io/oauth/revoke')
    expect(Object.fromEntries(fetchFn.mock.calls[0][1].body)).toEqual({
      token: 'TOKEN',
      client_id: 'client-1'
    })
  })

  test('fails when itch.io does not accept it', async () => {
    await expect(revokeToken('T', reply({}, false, 500))).rejects.toThrow('500')
  })
})
