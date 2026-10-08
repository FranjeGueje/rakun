import { CallRunnerOptions, Runner, ExecResult } from 'common/types'

import { join, isAbsolute } from 'path'

import { quoteIfNecessary, errorHandler, memoryLog } from './utils'
import { logError, logInfo, LogPrefix } from './logger'
import { spawn } from 'child_process'
import { LegendaryCommand } from './storeManagers/legendary/commands'
import { libraryManagerMap } from 'backend/storeManagers'

interface RunnerProps {
  name: Runner
  logPrefix: LogPrefix
  bin: string
  dir?: string
}

const commandsRunning: Record<string, Promise<ExecResult>> = {}

function appNameFromCommandParts(commandParts: string[], runner: Runner) {
  let appNameIndex = -1
  let idx = -1

  switch (runner) {
    case 'gog':
      idx = commandParts.findIndex((value) =>
        ['download', 'repair', 'update'].includes(value)
      )
      if (idx > -1) {
        appNameIndex = idx + 1
      }
      break
    case 'legendary':
      idx = commandParts.findIndex((value) =>
        ['install', 'repair', 'update'].includes(value)
      )
      if (idx > -1) {
        appNameIndex = idx + 1
      }
      break
    case 'nile':
      idx = commandParts.findIndex((value) =>
        ['install', 'update', 'verify'].includes(value)
      )
      if (idx > -1) {
        appNameIndex = commandParts.length - 1
      }
      break
  }

  return appNameIndex > -1 ? commandParts[appNameIndex] : ''
}

export async function callRunner(
  commandParts: string[],
  runner: RunnerProps,
  options: CallRunnerOptions
): Promise<ExecResult> {
  const appName = appNameFromCommandParts(commandParts, runner.name)

  options.logWriters ??= []

  commandParts = commandParts.filter(Boolean)

  let bin = runner.bin
  const fullRunnerPath = runner.dir ? join(runner.dir, bin) : bin

  if (!isAbsolute(bin) && runner.dir) bin = './' + bin

  const safeCommand = getRunnerCallWithoutCredentials(
    [...commandParts],
    options?.env,
    fullRunnerPath
  )

  const prefix = `${options.logMessagePrefix ?? 'Running command'}:`
  logInfo([prefix, safeCommand], runner.logPrefix)

  if (options?.logWriters) {
    for (const writer of options.logWriters) {
      await writer.logInfo(
        [prefix, safeCommand, '\n\n'].filter(Boolean).join(' ')
      )
      if (appName) await writer.logInfo('Game Output:')
    }
  }

  const key = [runner.name, commandParts].join(' ')
  const currentPromise = commandsRunning[key]

  if (key in commandsRunning) {
    return currentPromise
  }

  const abortId = options?.abortId || appName || Math.random().toString()
  const { createAbortController, deleteAbortController } =
    await import('./utils/aborthandler/aborthandler')
  const abortController = createAbortController(abortId)

  let promise = new Promise<ExecResult>((res, rej) => {
    const child = spawn(bin, commandParts, {
      cwd: options?.cwd || runner.dir,
      env: { ...process.env, ...options?.env },
      signal: abortController.signal
    })

    const stdout = memoryLog()
    const stderr = memoryLog()

    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (data: string) => {
      const stringToLog = options?.logSanitizer
        ? options.logSanitizer(data)
        : data

      options?.logWriters?.forEach((writer) => writer.writeString(stringToLog))

      if (options?.onOutput) {
        options.onOutput(data, child)
      }

      stdout.push(data.trim())
    })

    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (data: string) => {
      const stringToLog = options?.logSanitizer
        ? options.logSanitizer(data)
        : data

      options?.logWriters?.forEach((writer) => writer.writeString(stringToLog))

      if (options?.onOutput) {
        options.onOutput(data, child)
      }

      stderr.push(data.trim())
    })

    child.on('close', (code, signal) => {
      void errorHandler(
        `${stdout.join().concat(stderr.join())}`,
        appName,
        runner.name
      )

      if (signal && !child.killed) {
        rej(new Error(`Process terminated with signal ${signal}`))
      }

      res({
        stdout: stdout.join(),
        stderr: stderr.join('\n')
      })
    })

    child.on('error', (error) => {
      rej(error)
    })
  })

  promise = promise
    .then(({ stdout, stderr }) => {
      return { stdout, stderr, fullCommand: safeCommand }
    })
    .catch((error) => {
      if (abortController.signal.aborted) {
        logInfo(['Abort command', `"${safeCommand}"`], runner.logPrefix)

        return {
          stdout: '',
          stderr: '',
          fullCommand: safeCommand,
          abort: true
        }
      }

      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        const message = `Cannot run ${fullRunnerPath}: it is not there. The helper binaries are installed with: rakunctl helpers update`
        logError([message], runner.logPrefix)
        return {
          stdout: '',
          stderr: message,
          fullCommand: safeCommand,
          error: new Error(message)
        }
      }

      void errorHandler(error, appName, runner.name)

      logError(
        ['Error running', 'command', `"${safeCommand}":`, error],
        runner.logPrefix
      )

      return { stdout: '', stderr: `${error}`, fullCommand: safeCommand, error }
    })
    .finally(() => {
      delete commandsRunning[key]
      deleteAbortController(abortId)
    })

  commandsRunning[key] = promise

  return promise
}

function getRunnerCallWithoutCredentials(
  command: string[] | LegendaryCommand,
  env: Record<string, string> | NodeJS.ProcessEnv = {},
  runnerPath: string
): string {
  if (!Array.isArray(command))
    command = libraryManagerMap['legendary'].commandToArgsArray(command)

  const modifiedCommand = [...command]
  for (const sensitiveArg of ['--code', '--token']) {
    if (runnerPath === 'powershell') {
      const argumentListIndex = modifiedCommand.indexOf('-ArgumentList') + 1
      if (!argumentListIndex) continue
      modifiedCommand[argumentListIndex] = modifiedCommand[
        argumentListIndex
      ].replace(
        new RegExp(`"${sensitiveArg}","(.*?)"`),
        `"${sensitiveArg}","<redacted>"`
      )
    } else {
      const sensitiveArgIndex = modifiedCommand.indexOf(sensitiveArg)
      if (sensitiveArgIndex === -1) {
        continue
      }
      modifiedCommand[sensitiveArgIndex + 1] = '<redacted>'
    }
  }

  const formattedEnvVars: string[] = []
  for (const [key, value] of Object.entries(env)) {
    if (key in process.env) {
      if (value === process.env[key]) {
        continue
      }
    }
    formattedEnvVars.push(`${key}=${quoteIfNecessary(value ?? '')}`)
  }

  return [
    ...formattedEnvVars,
    quoteIfNecessary(runnerPath),
    ...modifiedCommand.map(quoteIfNecessary)
  ].join(' ')
}
