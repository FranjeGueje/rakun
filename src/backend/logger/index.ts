import { getSystemInfo, systemInfoLines } from 'backend/utils/systeminfo'
import { backendEvents } from 'backend/backend_events'

import { LogPrefix, RunnerToLogPrefixMap } from './constants'
import LogWriter from './log_writer'
import { gamesListText } from './games_list'
import { GameLogType, getLogFilePath } from './paths'

import type { GameInfo, Runner } from 'common/types'

let rakunLogWriter: LogWriter
const runnerLogWriters = new Map<Runner, LogWriter>()

const logDebug = (...params: Parameters<LogWriter['logDebug']>) => {
  void rakunLogWriter.logDebug(...params)
}
const logInfo = (...params: Parameters<LogWriter['logInfo']>) => {
  void rakunLogWriter.logInfo(...params)
}
const logWarning = (...params: Parameters<LogWriter['logWarning']>) => {
  void rakunLogWriter.logWarning(...params)
}
const logError = (...params: Parameters<LogWriter['logError']>) => {
  void rakunLogWriter.logError(...params)
}

function getRunnerLogWriter(runner: Runner) {
  const writer = runnerLogWriters.get(runner)
  if (writer) return writer

  const newWriter = new LogWriter(getLogFilePath({ runner }), false, false)
  runnerLogWriters.set(runner, newWriter)
  return newWriter
}

/** One entry per line, so that every line of the system information has the prefix */
async function logSystemInfo() {
  const lines = [
    'System Information:',
    ...systemInfoLines(await getSystemInfo())
  ]
  // One after the other: written together they could come out of order
  for (const line of lines)
    await rakunLogWriter.logInfo(line, LogPrefix.Backend)
}

/** Writes the games a store just listed to that store's own log */
function logGamesList(runner: Runner, games: GameInfo[]) {
  void getRunnerLogWriter(runner).logInfo(gamesListText(games))
}

function createGameLogWriter(
  appName: string,
  runner: Runner,
  type: GameLogType = 'launch'
): LogWriter {
  return new LogWriter(getLogFilePath({ appName, runner, type }), false, false)
}

function init() {
  // Add a basic error handler to our stdout/stderr. If we don't do this,
  // the main `process.on('uncaughtException', ...)` handler catches them (and
  // presents an error message to the user, which is hardly necessary for
  // "just" failing to write to the streams)
  for (const channel of ['stdout', 'stderr'] as const) {
    process[channel].once('error', (error: Error) => {
      void rakunLogWriter.writeString(
        `Error writing to ${channel}: ${error.stack}`
      )

      process[channel].on('error', () => {
        // Silence further write errors
      })
    })
  }

  rakunLogWriter = new LogWriter(getLogFilePath({}), true, false)

  void logSystemInfo()

  backendEvents.on('settingChanged', ({ key, oldValue, newValue }) =>
    rakunLogWriter.logInfo([
      'Settings key',
      key,
      'changed from',
      oldValue,
      'to',
      newValue
    ])
  )
}

export {
  init,
  logDebug,
  logInfo,
  logWarning,
  logError,
  logGamesList,
  createGameLogWriter,
  LogPrefix,
  RunnerToLogPrefixMap,
  getLogFilePath
}
