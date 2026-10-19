import { spawn } from 'child_process'
import { logError, LogPrefix } from 'backend/logger'

/** Runs one opener; true only when it ran and ended well */
function tryOpen(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}

/**
 * Hands a URL (steam:// too) or a local path to the desktop's handler,
 * replacing Electron's `shell.openExternal` and `shell.openPath`.
 *
 * `gio open` goes first: `xdg-open` picks its handler from the desktop
 * environment variables, and the daemon may not have them (no
 * KDE_SESSION_VERSION when started from a systemd user service), so it can
 * fail silently with exit code 0. `xdg-open` stays as the fallback for a
 * system without gio.
 *
 * Never rejects: it answers whether the target was opened and logs a failure.
 * Deliberately uses `child_process` directly rather than `spawnAsync` from
 * `backend/utils`, so that the `rakun/` modules can use it without pulling in
 * the whole utils barrel.
 */
export async function openExternal(target: string): Promise<boolean> {
  if (await tryOpen('gio', ['open', target])) return true
  if (await tryOpen('xdg-open', [target])) return true
  logError(
    `Could not open "${target}": neither gio open nor xdg-open managed to`,
    LogPrefix.Backend
  )
  return false
}
