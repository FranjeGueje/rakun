import type { Runner } from 'common/types'

export type LoginInfo = {
  runner: Runner
  /** Page to open in a browser to log in */
  url: string
  /** What to paste back into `submitLogin` once the browser reaches the end */
  instructions: string
  /** The browser comes back to rakun by itself: a client can wait for the session instead of asking for a paste */
  callback?: boolean
  /**
   * Another way to log in, when the store has one: its own page and what it gives.
   * The first way (`url`, `instructions`) is the one that asks for the least.
   */
  alternative?: { url: string; label: string; instructions: string }
}

export type LoginResult = { ok: boolean; error?: string }
