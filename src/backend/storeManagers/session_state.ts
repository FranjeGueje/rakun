import { logWarning, LogPrefix } from 'backend/logger'
import type { Runner } from 'common/types'

// A session that a store refused (the token ran out or was revoked). It does not
// heal by itself: it is left until the user logs in again or out, so nothing is
// deleted and nobody is logged out behind their back. Kept in memory: a restart
// finds it again the first time the store refuses.
const expired = new Set<Runner>()

export function markSessionExpired(runner: Runner) {
  if (expired.has(runner)) return
  expired.add(runner)
  logWarning(
    `The ${runner} session has expired: log in again`,
    LogPrefix.Backend
  )
}

export const clearSessionExpired = (runner: Runner) => expired.delete(runner)

export const isSessionExpired = (runner: Runner) => expired.has(runner)
