import { GAME_LOG_TYPES, type GetLogFileArgs } from './paths'
import { RunnerToLogPrefixMap } from './constants'

// Every store has a log prefix (a Record over the runners), so this follows the registry
const LOG_RUNNERS: readonly unknown[] = Object.keys(RunnerToLogPrefixMap)

function isSafeName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[\w.-]+$/.test(value) &&
    value !== '.' &&
    value !== '..'
  )
}

/**
 * The names go into a file path, so only known runners and plain names pass:
 * `../../x` must not be able to leave the log folder.
 */
export function isSafeLogRequest(args: unknown): args is GetLogFileArgs {
  if (typeof args !== 'object' || args === null) return false
  const { appName, runner, type } = args as Record<string, unknown>

  if (runner !== undefined && !LOG_RUNNERS.includes(runner)) return false
  if (appName === undefined) return type === undefined
  return (
    isSafeName(appName) &&
    runner !== undefined &&
    (type === undefined || GAME_LOG_TYPES.some((known) => known === type))
  )
}
