import { libraryOf } from './library_of'
import { showDialogBoxModalAuto } from 'backend/dialog/dialog'
import type { Runner } from 'common/types'
import type { NetworkOp } from 'common/types/game_manager'
import { isSessionExpired } from './session_state'

/** What cannot be done with a session the store refused: all of it needs the store, but importing */
const NEEDS_SESSION: readonly NetworkOp[] = ['install', 'update', 'repair']

/** Why the operation cannot start now, if it cannot */
async function reasonToRefuse(
  runner: Runner,
  op: NetworkOp,
  appName: string
): Promise<string | undefined> {
  if (NEEDS_SESSION.includes(op) && isSessionExpired(runner))
    return `Your ${runner} session has expired: log in again and retry`
  if (op === 'repair') return undefined
  return libraryOf(runner).preflight?.(op, appName)
}

/** Asks if the operation can start; when it cannot, says why in a warning and answers true */
export async function isRefused(
  runner: Runner,
  op: NetworkOp,
  appName: string
): Promise<boolean> {
  const reason = await reasonToRefuse(runner, op, appName)
  if (!reason) return false
  showDialogBoxModalAuto({ title: 'Warning', message: reason, type: 'ERROR' })
  return true
}
