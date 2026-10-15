import type { Runner } from 'common/types'

export type LoginInfo = {
  runner: Runner
  /** Page to open in a browser to log in */
  url: string
  /** What to paste back into `submitLogin` once the browser reaches the end */
  instructions: string
  /** The browser comes back to rakun by itself: a client can wait for the session instead of asking for a paste */
  callback?: boolean
}

export type LoginResult = { ok: boolean; error?: string }
