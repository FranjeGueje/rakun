import type { Runner } from 'common/types'

export type AccountStatus = { loggedIn: boolean; name?: string }

export type AccountsStatus = Record<Runner, AccountStatus>

export type SessionImportResult = 'imported' | 'already' | 'missing' | 'invalid'

export type SessionsImport = Record<Runner, SessionImportResult>
