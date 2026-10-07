import { existsSync } from 'fs'
import { isSteamDeckGameMode } from 'backend/constants/environment'

export type DisplayCheck = { ok: true } | { ok: false; reason: string }

const LOCAL_DISPLAY = /^:(\d+)(\.\d+)?$/

/**
 * Whether the window of a Windows installer has somewhere to open. Proton draws
 * through X11 (or XWayland), so `DISPLAY` is what counts. It only says a screen
 * exists, not that somebody is looking at it, and rakun keeps the environment of
 * whoever started it.
 */
export function displayForInstaller(
  env: NodeJS.ProcessEnv = process.env,
  socketExists: (path: string) => boolean = existsSync,
  gameMode: boolean = isSteamDeckGameMode
): DisplayCheck {
  const display = env.DISPLAY
  if (!display)
    return { ok: false, reason: 'rakun has no screen (DISPLAY is empty)' }
  if (gameMode)
    return {
      ok: false,
      reason:
        'rakun runs in game mode: the installer window would not be visible'
    }
  const local = LOCAL_DISPLAY.exec(display)
  if (local && !socketExists(`/tmp/.X11-unix/X${local[1]}`))
    return { ok: false, reason: `the X server ${display} does not answer` }
  return { ok: true }
}
