import { libraryOf } from './library_of'
import { showDialogBoxModalAuto } from 'backend/dialog/dialog'
import type { Runner } from 'common/types'
import type { PreflightOp } from 'common/types/game_manager'

/** Asks the store if the operation can start; when it cannot, says why in a warning and answers true */
export async function isRefused(
  runner: Runner,
  op: PreflightOp,
  appName: string
): Promise<boolean> {
  const reason = await libraryOf(runner).preflight?.(op, appName)
  if (!reason) return false
  showDialogBoxModalAuto({ title: 'Warning', message: reason, type: 'ERROR' })
  return true
}
