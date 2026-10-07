import { homedir } from 'os'
import { join } from 'path'

import type { Runner } from 'common/types'
import type { RunnerOrComet } from './types'

/**
 * Returns the base directory to store all logs
 */
function getBaseLogPath(): string {
  const stateHome =
    process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state')
  return join(stateHome, 'Relicd', 'logs')
}

// Which game log to return. By default, the launch log is returned.
const GAME_LOG_TYPES = [
  'launch',
  'install',
  'import',
  'repair',
  'update',
  'setup'
] as const
type GameLogType = (typeof GAME_LOG_TYPES)[number]
type GetLogFileArgs =
  // Relic log
  | { appName?: undefined; runner?: undefined }
  // Runner log
  | { appName?: undefined; runner: RunnerOrComet }
  // Game log
  | { appName: string; runner: Runner; type?: GameLogType }

/**
 * Returns the path to the log file of a game / runner / Relic
 * @param args Parameters to find the log file. See {@link GetLogFileArgs}
 */
function getLogFilePath(args: GetLogFileArgs): string {
  let relativeFilePath: string
  if (!(args?.appName || args?.runner)) {
    relativeFilePath = 'relicd'
  } else if (args.runner && !args.appName) {
    relativeFilePath = join('runners', args.runner)
  } else {
    const { appName, runner, type = 'launch' } = args
    relativeFilePath = join('games', `${appName}_${runner}`, type)
  }

  return join(getBaseLogPath(), relativeFilePath + '.log')
}

export { getLogFilePath, GAME_LOG_TYPES }
export type { GameLogType, GetLogFileArgs }
