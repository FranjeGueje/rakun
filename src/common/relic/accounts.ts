import type { Runner } from 'common/types'

export type AccountStatus = { loggedIn: boolean; name?: string }

export type AccountsStatus = Record<Runner, AccountStatus>
