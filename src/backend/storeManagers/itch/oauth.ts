import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import {
  ITCH_AUTHORIZE_URL,
  ITCH_CALLBACK_PATH,
  ITCH_CLIENT_ID,
  ITCH_LOGIN_TTL_MS,
  ITCH_REVOKE_URL,
  ITCH_SCOPE,
  ITCH_TOKEN_URL
} from './constants'

/** What is kept between the login address and the browser coming back: the secret half of PKCE and the state */
export type PendingLogin = {
  verifier: string
  state: string
  redirectUri: string
  expires: number
}

type Fetch = typeof fetch

const base64url = (data: Buffer) => data.toString('base64url')

/** 64 characters from the alphabet PKCE allows (43 to 128) */
export const newVerifier = () => base64url(randomBytes(48))

export const challengeOf = (verifier: string) =>
  base64url(createHash('sha256').update(verifier).digest())

export const newState = () => base64url(randomBytes(24))

export const redirectUriFor = (port: number) =>
  `http://127.0.0.1:${port}${ITCH_CALLBACK_PATH}`

export function newPendingLogin(port: number, now = Date.now()): PendingLogin {
  return {
    verifier: newVerifier(),
    state: newState(),
    redirectUri: redirectUriFor(port),
    expires: now + ITCH_LOGIN_TTL_MS
  }
}

/** The address the user opens to authorize rakun */
export function authorizeUrl({ verifier, state, redirectUri }: PendingLogin) {
  const query = new URLSearchParams({
    client_id: ITCH_CLIENT_ID,
    scope: ITCH_SCOPE,
    response_type: 'code',
    code_challenge: challengeOf(verifier),
    code_challenge_method: 'S256',
    state,
    redirect_uri: redirectUri
  })
  return `${ITCH_AUTHORIZE_URL}?${query.toString()}`
}

function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** Whether `state` belongs to this login, which has not run out */
export function matchesPending(
  pending: PendingLogin | undefined,
  state: string | undefined,
  now = Date.now()
): pending is PendingLogin {
  return (
    !!pending &&
    !!state &&
    now <= pending.expires &&
    sameState(pending.state, state)
  )
}

/** What itch.io appended to the address it sent the browser to */
export type Callback = { code?: string; state?: string; error?: string }

/** The `code`, `state` and `error` of a callback address; undefined for anything that is not an address */
export function parseCallback(pasted: string): Callback | undefined {
  try {
    const query = new URL(pasted.trim()).searchParams
    return {
      code: query.get('code') || undefined,
      state: query.get('state') || undefined,
      error: query.get('error') || undefined
    }
  } catch {
    return undefined
  }
}

/** Trades the code of the callback for the token (it does not expire and has no refresh) */
export async function exchangeCode(
  pending: PendingLogin,
  code: string,
  fetchFn: Fetch = fetch
): Promise<string> {
  const response = await fetchFn(ITCH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: pending.verifier,
      redirect_uri: pending.redirectUri,
      client_id: ITCH_CLIENT_ID
    })
  })
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string
    error?: string
    error_description?: string
  }
  if (!response.ok || !body.access_token)
    throw new Error(
      `itch.io did not give a token (${body.error_description ?? body.error ?? response.status})`
    )
  return body.access_token
}

const REVOKE_TIMEOUT_MS = 10_000

/** Makes itch.io forget the token; a failure is the caller's to log, it must not stop a logout */
export async function revokeToken(
  token: string,
  fetchFn: Fetch = fetch
): Promise<void> {
  const response = await fetchFn(ITCH_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token, client_id: ITCH_CLIENT_ID }),
    // Offline, a logout must not wait for the network to give up by itself
    signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS)
  })
  if (!response.ok) throw new Error(`itch.io answered ${response.status}`)
}
