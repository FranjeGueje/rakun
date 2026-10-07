import { readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { appFolder, relicGamesPath } from 'backend/constants/paths'
import { credentialsPath } from './server/credentials'

/** Lets the HTTP answer reach the client before relicd stops */
const EXIT_DELAY_MS = 1000

/** Removes everything inside the folder except the entry to keep */
export function removeAllBut(folder: string, keep: string) {
  for (const entry of readdirSync(folder)) {
    const path = join(folder, entry)
    if (path !== keep) rmSync(path, { recursive: true, force: true })
  }
}

/**
 * Forgets sessions, settings, the queue and per-game data. Installed games and
 * the API credentials stay. The caller stops relicd afterwards.
 */
export function resetRelic() {
  removeAllBut(appFolder, credentialsPath)
  rmSync(relicGamesPath, { recursive: true, force: true })
}

export function stopAfterReply(stop: () => void) {
  setTimeout(stop, EXIT_DELAY_MS)
}

export function resetAndStop(stop: () => void) {
  resetRelic()
  stopAfterReply(stop)
}
