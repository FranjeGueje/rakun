import type { Runner } from 'common/types'

export type AccountStatus = { loggedIn: boolean; name?: string }

export type AccountsStatus = Record<Runner, AccountStatus>

/** `verified`: the store was asked over the network; if not, `loggedIn` is only what is stored here */
export type AccountCheck = { loggedIn: boolean; verified: boolean }

export type AccountsCheck = Record<Runner, AccountCheck>
