import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { rakunMountPath } from 'backend/constants/paths'
import { logInfo } from 'backend/logger'
import type { GameRunner } from './steam_shortcuts/types'

const LOG_PREFIX = 'Rakun'

export const RUNNER_NAME = 'FranjeGueje runner'
export const RUNNER_VERSION = 1
/** Folder of the mount for the scripts that run inside the prefixes */
export const SCRIPTS_DIR = 'scripts'
export const RUNNER_BAT = 'Launcher_games.bat'
/** The options of the runner: next to it, created once and never overwritten */
export const RUNNER_INI = 'Launcher_games.ini'
/** Where the runner leaves the log of a game (inside the mount) when `LOG_TO_FILE` is on */
const LOGS_DIR = 'logs'

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
    'the output goes to logs/<game name>.log, not the window'
  ]
] as const

const RULE = 'rem ============================================================'
export const section = (title: string) => ['', RULE, `rem ${title}`, RULE, '']

export const missingTool = (
  tool: string,
  path = `%LAUNCHERS%\\bin\\${tool}`
) => [
  `if not exist "${path}" (`,
  `    echo [ERROR]: ${tool} not found.`,
  '    timeout /t 2 /nobreak >nul',
  '    exit /b 1',
  ')',
  ''
]

const legendaryLines = [
  ':legendary',
  ...section('PRECHECKS'),
  ...missingTool('legendary.exe'),
  ...section('START THE GAME'),
  'if "%RK_SHOW_VERSIONS%"=="1" legendary status',
  '',
  'legendary launch %IDGAME% %*',
  'goto :end'
]

const gogLines = [
  ':gog',
  ...section('PRECHECKS'),
  ...missingTool('gogdl.exe'),
  ...missingTool('comet.exe'),
  'if not exist "%LAUNCHERS%\\gog_store\\auth.json" (',
  '    echo [ERROR]: NOT AUTHENTICATED ON GOG. Please, login on Rakun.',
  '    timeout /t 2 /nobreak >nul',
  '    exit /b 1',
  ')',
  ...section('Start Comet'),
  'mkdir "%APPDATA%\\heroic\\gog_store" >nul 2>&1',
  'copy "%LAUNCHERS%\\gog_store\\*" "%APPDATA%\\heroic\\gog_store\\" >nul 2>&1',
  'cd /d "%LAUNCHERS%\\bin\\"',
  'if "%RK_SHOW_VERSIONS%"=="1" comet.exe --version',
  '',
  'start "" /b "install-dummy-service.bat" >nul 2>&1',
  'start "" /b "comet.exe" --from-heroic --username "%GOGUSER%" >nul 2>&1',
  '',
  'timeout /t 2 /nobreak >nul',
  ...section('START THE GAME'),
  `if "%RK_SHOW_VERSIONS%"=="1" for /f "delims=" %%v in ('gogdl --version') do echo gogdl version: %%v`,
  '',
  '@gogdl --auth-config-path c:\\Launchers\\gog_store\\auth.json launch --platform windows "c:\\games\\%GAMEFOLDER%" %IDGAME% -- %*',
  'set "COMETNOTE=1"',
  'goto :end'
]

const nileLines = [
  ':nile',
  ...section('PRECHECKS'),
  ...missingTool('nile.exe'),
  ...section('START THE GAME'),
  `if "%RK_SHOW_VERSIONS%"=="1" for /f "delims=" %%v in ('nile --version') do echo nile version: %%v`,
  '',
  'nile launch %IDGAME% -- %*',
  'goto :end'
]

/**
 * The runner of every game: it reads `STORE` and `IDGAME` (and, on GOG,
 * `GAMEFOLDER` and `GOGUSER`) from the small `.bat` of each game and does what
 * its store needs. Raising `RUNNER_VERSION` and changing this text is all it
 * takes to move every game to a new runner.
 */
export function runnerScriptText(): string {
  return [
    '@echo off',
    `title ${RUNNER_NAME}`,
    ...section('Configuration'),
    'set "LAUNCHERS=C:\\Launchers"',
    ...optionsLines(),
    'if not defined GAMENAME set "GAMENAME=%STORE%-%IDGAME%"',
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
    'if /i "%STORE%"=="legendary" goto :legendary',
    'if /i "%STORE%"=="gog" goto :gog',
    'if /i "%STORE%"=="nile" goto :nile',
    'echo [ERROR]: unknown store "%STORE%".',
    'timeout /t 2 /nobreak >nul',
    'exit /b 1',
    '',
    ...legendaryLines,
    '',
    ...gogLines,
    '',
    ...nileLines,
    '',
    ':end',
    'echo.',
    'echo ---------------------------------------------------------',
    'if defined COMETNOTE echo COMET IS RUNNING.',
    "echo If you've closed the game, you can close this window now.",
    'echo ---------------------------------------------------------',
    'goto :eof',
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
    `mkdir "%LAUNCHERS%\\${LOGS_DIR}" >nul 2>&1`,
    `call "%~f0" %* > "%LAUNCHERS%\\${LOGS_DIR}\\%GAMENAME%.log" 2>&1`,
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

const STORES_WITH_RUNNER: GameRunner[] = ['legendary', 'gog', 'nile']

/** What the Steam shortcut of a game runs: its variables and a call to the runner */
export function gameRunnerText({
  store,
  appName,
  title,
  folder,
  username
}: {
  store: GameRunner
  appName: string
  /** Names the log of the game; without it the runner uses the store and the id */
  title?: string
  /** GOG: the folder of the game inside `c:\games` */
  folder?: string
  /** GOG: the user Comet logs in with */
  username?: string
}): string {
  if (!STORES_WITH_RUNNER.includes(store))
    throw new Error(`There is no runner for the store "${store}"`)
  const gameName = title ? logName(title) : ''
  const variables: [string, string][] = [
    ['STORE', store],
    ['IDGAME', appName],
    ...(gameName ? ([['GAMENAME', gameName]] as [string, string][]) : []),
    ...(store === 'gog'
      ? ([
          ['GAMEFOLDER', folder ?? ''],
          ['GOGUSER', username ?? '']
        ] as [string, string][])
      : [])
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

/** Writes the runner into the mount, rewritten at every start so a new version reaches every game */
export function writeRunnerScript(): string {
  const dir = join(rakunMountPath, SCRIPTS_DIR)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, RUNNER_BAT)
  writeFileSync(path, runnerScriptText(), 'utf-8')
  logInfo(`Created ${path} (${RUNNER_NAME} v${RUNNER_VERSION})`, LOG_PREFIX)
  return path
}
