import { appendFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { getLogFilePath } from 'backend/logger/paths'

/**
 * Says why relicd could not start, on the console and in the log file.
 * `relicctl start` runs relicd with no output, so the log is where the reason
 * has to be; it is written synchronously because the process ends right after
 * (the logger writes in the background and would be cut).
 */
export function reportStartFailure(error: unknown): void {
  console.error('relicd failed to start:', error)
  try {
    const file = getLogFilePath({})
    mkdirSync(dirname(file), { recursive: true })
    const reason = error instanceof Error ? error.message : String(error)
    appendFileSync(
      file,
      `(${new Date().toISOString()}) [ERROR]: relicd failed to start: ${reason}\n`
    )
  } catch {
    // the log folder cannot be written: the console line is all there is
  }
}
