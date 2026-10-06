import type { Runner } from 'common/types'

export type LoginInfo = {
  runner: Runner
  /** Page to open in a browser to log in */
  url: string
  /** What to paste back into `submitLogin` once the browser reaches the end */
  instructions: string
}

export type LoginResult = { ok: boolean; error?: string }
