import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { rakunMountPath } from 'backend/constants/paths'
import { logInfo } from 'backend/logger'
import {
  LOGS_PATH,
  SCRIPTS_DIR,
  section,
  type GameOptions,
  type StoreScript
} from './runner/bat'
import { gogScript } from './runner/gog'
import { itchScript } from './runner/itch'
import { legendaryScript } from './runner/legendary'
import { nileScript } from './runner/nile'
import { zoomScript } from './runner/zoom'
import type { GameRunner } from './steam_shortcuts/types'

const LOG_PREFIX = 'Rakun'

export const RUNNER_NAME = 'FranjeGueje runner'
export const RUNNER_VERSION = 1
export const RUNNER_BAT = 'Launcher_games.bat'
/** The options of the runner: next to it, created once and never overwritten */
const RUNNER_INI = 'Launcher_games.ini'

/** Where the runner is inside a prefix: the mount is `C:\Launchers` there */
const RUNNER_WINDOWS_PATH = `C:\\Launchers\\${SCRIPTS_DIR}\\${RUNNER_BAT}`

/** Option of the `.ini` and its default: what the runner does if the key is not there */
const RUNNER_OPTIONS = [
  ['SHOW_HEADER', '1', 'the name and version of the runner at the start'],
  [
    'SHOW_VERSIONS',
    '0',
    'the versions of comet, gogdl and nile and the status of legendary (slower)'
  ],
  [
    'LOG_TO_FILE',
    '0',
    'the output goes to C:\\logs\\<game name>.log of the prefix, not the window'
  ]
] as const

/** The script of each store the runner knows: the dispatch and the scripts come from here, so they cannot drift apart */
const STORE_SCRIPTS = {
  legendary: legendaryScript,
  gog: gogScript,
  nile: nileScript,
  itch: itchScript,
  zoom: zoomScript
} satisfies Partial<Record<GameRunner, StoreScript>>

export const STORES_WITH_RUNNER = Object.keys(STORE_SCRIPTS) as GameRunner[]

/** The file of a store's script in the scripts folder of the mount */
export const storeBatName = (store: string): string => `store_${store}.bat`

/** The script of a store: the runner calls it once it has set up the common part */
export function storeScriptText(store: keyof typeof STORE_SCRIPTS): string {
  return ['@echo off', ...STORE_SCRIPTS[store].lines].join('\n')
}

/**
 * The runner of every game. It does what every game shares (the options of the
 * `.ini`, the header, the log) from `STORE`, `IDGAME` and `GAMENAME`, which the
 * small `.bat` of each game sets, and calls the script of its store
 * (`store_<store>.bat`), which reads the variables of that store. The footer is
 * printed whatever the store did, also when a precheck of it failed (the error
 * stays above it), and the exit code is the store's. Raising `RUNNER_VERSION`
 * and changing this text is all it takes to move every game to a new runner.
 */
export function runnerScriptText(): string {
  return [
    '@echo off',
    `title ${RUNNER_NAME}`,
    ...section('Configuration'),
    'set "LAUNCHERS=C:\\Launchers"',
    ...optionsLines(),
    'if not defined GAMENAME set "GAMENAME=%STORE%-%IDGAME%"',
    'set "GAMENAME=%GAMENAME:\\=_%"',
    'if "%RK_LOG_TO_FILE%"=="1" if not defined RK_INLOG goto :logged',
    '',
    'if not "%RK_SHOW_HEADER%"=="0" (',
    `    echo ${RUNNER_NAME} v${RUNNER_VERSION}`,
    '    echo.',
    ')',
    '',
    'set "LEGENDARY_CONFIG_PATH=%LAUNCHERS%\\Legendary"',
    'set "NILE_CONFIG_PATH=%LAUNCHERS%"',
    'set "GOGDL_CONFIG_PATH=%LAUNCHERS%"',
    'set "PATH=%PATH%;%LAUNCHERS%\\bin"',
    ...section('STORE'),
    'if "%STORE%"=="" (',
    '    echo [ERROR]: STORE is not set.',
    '    timeout /t 2 /nobreak >nul',
    '    exit /b 1',
    ')',
    `set "RK_STORE_BAT=%LAUNCHERS%\\${SCRIPTS_DIR}\\${storeBatName('%STORE%')}"`,
    'if not exist "%RK_STORE_BAT%" (',
    '    echo [ERROR]: unknown store "%STORE%".',
    '    timeout /t 2 /nobreak >nul',
    '    exit /b 1',
    ')',
    ...section('START THE STORE'),
    'call "%RK_STORE_BAT%" %*',
    'set "RK_CODE=%errorlevel%"',
    'echo.',
    'echo ---------------------------------------------------------',
    "echo If you've closed the game, you can close this window now.",
    'echo ---------------------------------------------------------',
    'exit /b %RK_CODE%',
    '',
    ...loggedLines()
  ].join('\n')
}

/** The defaults of every option, then what the `.ini` says (a `RK_` prefix keeps a bad line from touching other variables) */
function optionsLines(): string[] {
  return [
    '',
    ...RUNNER_OPTIONS.map(([key, value]) => `set "RK_${key}=${value}"`),
    `if exist "%LAUNCHERS%\\${SCRIPTS_DIR}\\${RUNNER_INI}" for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%LAUNCHERS%\\${SCRIPTS_DIR}\\${RUNNER_INI}") do set "RK_%%a=%%b"`
  ]
}

/** Runs the runner again with its whole output sent to the log of the game */
function loggedLines(): string[] {
  return [
    ':logged',
    'set "RK_INLOG=1"',
    `mkdir "${LOGS_PATH}" >nul 2>&1`,
    `call "%~f0" %* > "${LOGS_PATH}\\%GAMENAME%.log" 2>&1`,
    'exit /b %errorlevel%'
  ]
}

/** A value inside `set "NAME=value"`: `%` would be expanded and `"` or a line break would break it */
export function batValue(value: string): string {
  return value.replace(/["\r\n]/g, '').replaceAll('%', '%%')
}

/** A game title as a file name for its log: nothing Windows does not allow in one */
export function logName(title: string): string {
  return title.replace(/[\\/:*?"<>|%\r\n]/g, '_').replace(/[. ]+$/, '')
}

/** What the Steam shortcut of a game runs: its variables and a call to the runner */
export function gameRunnerText({
  store,
  title,
  ...options
}: GameOptions & {
  store: GameRunner
  /** Names the log of the game; without it the runner uses the store and the id */
  title?: string
}): string {
  if (!STORES_WITH_RUNNER.includes(store))
    throw new Error(`There is no runner for the store "${store}"`)
  const script: StoreScript = STORE_SCRIPTS[store]
  const gameName = title ? logName(title) : ''
  const variables: [string, string][] = [
    ['STORE', store],
    ['IDGAME', script.idGame?.(options) ?? options.appName],
    ...(gameName ? ([['GAMENAME', gameName]] as [string, string][]) : []),
    ...(script.variables?.(options) ?? [])
  ]
  return [
    '@echo off',
    `rem ${RUNNER_NAME}: the logic is in ${RUNNER_WINDOWS_PATH}`,
    ...variables.map(([name, value]) => `set "${name}=${batValue(value)}"`),
    `call "${RUNNER_WINDOWS_PATH}" %*`,
    'exit /b %errorlevel%'
  ].join('\n')
}

/** The options file: only created, so what the user wrote in it stays */
export function writeRunnerIni(): string {
  const dir = join(rakunMountPath, SCRIPTS_DIR)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, RUNNER_INI)
  if (existsSync(path)) return path
  const content = [
    `# Options of ${RUNNER_NAME}: 1 = yes, 0 = no. The next launch of a game uses them.`,
    ...RUNNER_OPTIONS.flatMap(([key, value, what]) => [
      `# ${what}`,
      `${key}=${value}`
    ]),
    ''
  ].join('\n')
  writeFileSync(path, content, 'utf-8')
  logInfo(`Created ${path}`, LOG_PREFIX)
  return path
}

/**
 * Writes the runner and the script of each store into the mount, rewritten at
 * every start so a new version reaches every game. The script of a store that is
 * taken out of rakun would stay in the folder: nothing calls it.
 */
export function writeRunnerScript(): string {
  const dir = join(rakunMountPath, SCRIPTS_DIR)
  mkdirSync(dir, { recursive: true })
  for (const store of STORES_WITH_RUNNER)
    writeFileSync(
      join(dir, storeBatName(store)),
      storeScriptText(store),
      'utf-8'
    )
  const path = join(dir, RUNNER_BAT)
  writeFileSync(path, runnerScriptText(), 'utf-8')
  logInfo(`Created ${path} (${RUNNER_NAME} v${RUNNER_VERSION})`, LOG_PREFIX)
  return path
}
