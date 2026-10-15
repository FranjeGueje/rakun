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
/** The script that starts Comet for a GOG game, next to the runner */
export const COMET_BAT = 'comet.bat'
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

/** The label of a store between two bands, so each store stands out in the runner */
const storeBanner = (store: string) => [
  `rem ${'/'.repeat(60)}`,
  `rem ${'*'.repeat(60)}`,
  `:${store}`,
  `rem ${'*'.repeat(60)}`,
  `rem ${'\\'.repeat(60)}`
]

const legendaryLines = [
  ...storeBanner('legendary'),
  ...section('PRECHECKS'),
  ...missingTool('legendary.exe'),
  ...section('START THE GAME'),
  'if "%RK_SHOW_VERSIONS%"=="1" legendary status',
  '',
  'legendary launch %IDGAME% %*',
  'goto :end'
]

/** `--prefer-task N` for gogdl when `PLAYTASK` is a number other than 0 (0 = the task GOG marks as primary); anything else is ignored */
const playTaskLines = [
  'set "RK_TASK="',
  'if defined PLAYTASK set "RK_TASK=--prefer-task %PLAYTASK% "',
  'if defined PLAYTASK for /f "delims=0123456789" %%a in ("%PLAYTASK%") do set "RK_TASK="',
  'if "%PLAYTASK%"=="0" set "RK_TASK="'
]

const gogLines = [
  ...storeBanner('gog'),
  ...section('PRECHECKS'),
  ...missingTool('gogdl.exe'),
  ...missingTool('comet.exe'),
  'if not exist "%LAUNCHERS%\\gog_store\\auth.json" (',
  '    echo [ERROR]: NOT AUTHENTICATED ON GOG. Please, login on Rakun.',
  '    timeout /t 2 /nobreak >nul',
  '    exit /b 1',
  ')',
  ...section('Start Comet'),
  'if "%RK_SHOW_VERSIONS%"=="1" comet.exe --version',
  '',
  'echo Launching Comet ...',
  'echo.',
  `call "%LAUNCHERS%\\${SCRIPTS_DIR}\\${COMET_BAT}" "%GOGUSER%"`,
  'timeout /t 1 /nobreak >nul',
  ...section('START THE GAME'),
  `if "%RK_SHOW_VERSIONS%"=="1" for /f "delims=" %%v in ('gogdl --version') do echo gogdl version: %%v`,
  '',
  ...playTaskLines,
  '@gogdl --auth-config-path "%LAUNCHERS%\\gog_store\\auth.json" launch --platform windows %RK_TASK%"c:\\games\\%GAMEFOLDER%" %IDGAME% -- %*',
  'goto :end'
]

const nileLines = [
  ...storeBanner('nile'),
  ...section('PRECHECKS'),
  ...missingTool('nile.exe'),
  ...section('START THE GAME'),
  `if "%RK_SHOW_VERSIONS%"=="1" for /f "delims=" %%v in ('nile --version') do echo nile version: %%v`,
  '',
  'nile launch %IDGAME% -- %*',
  'goto :end'
]

/**
 * itch.io has no tool of its own to run a game: `IDGAME` is the game's executable
 * as `<folder>\<path>` under `c:\games` (see `itchGameId`). It is run from its own
 * folder and waited for, so that Steam sees the game running until it closes.
 */
const itchLines = [
  ...storeBanner('itch'),
  ...section('PRECHECKS'),
  'set "RK_EXE=c:\\games\\%IDGAME%"',
  ...missingTool('game executable', '%RK_EXE%'),
  ...section('START THE GAME'),
  'for %%i in ("%RK_EXE%") do set "RK_DIR=%%~dpi"',
  'cd /d "%RK_DIR%"',
  'start "" /wait "%RK_EXE%" %*',
  'goto :end'
]

/** The block of each store the runner knows: the dispatch and the blocks come from here, so they cannot drift apart */
const STORE_BLOCKS = {
  legendary: legendaryLines,
  gog: gogLines,
  nile: nileLines,
  itch: itchLines
} satisfies Partial<Record<GameRunner, string[]>>

export const STORES_WITH_RUNNER = Object.keys(STORE_BLOCKS) as GameRunner[]

/**
 * The runner of every game: it reads `STORE` and `IDGAME` (and, on GOG,
 * `GAMEFOLDER`, `GOGUSER` and `PLAYTASK`) from the small `.bat` of each game and does what
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
    ...STORES_WITH_RUNNER.map(
      (store) => `if /i "%STORE%"=="${store}" goto :${store}`
    ),
    'echo [ERROR]: unknown store "%STORE%".',
    'timeout /t 2 /nobreak >nul',
    'exit /b 1',
    '',
    ...Object.values(STORE_BLOCKS).flatMap((block) => [...block, '']),
    ':end',
    'echo.',
    'echo ---------------------------------------------------------',
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

/** `IDGAME` of an itch.io game: its executable under `c:\games`; butler gives the path with `/` and cmd needs `\` */
export const itchGameId = (folder: string, executable: string): string =>
  `${folder}\\${executable.replaceAll('/', '\\')}`

/** The value of `IDGAME`: the id of the game the store's tool is asked for, or for itch.io its executable */
function gameId(
  store: GameRunner,
  appName: string,
  folder?: string,
  executable?: string
): string {
  if (store !== 'itch') return appName
  if (!folder || !executable)
    throw new Error('The itch game has no executable to run')
  return itchGameId(folder, executable)
}

/** What the Steam shortcut of a game runs: its variables and a call to the runner */
export function gameRunnerText({
  store,
  appName,
  title,
  folder,
  username,
  executable
}: {
  store: GameRunner
  appName: string
  /** Names the log of the game; without it the runner uses the store and the id */
  title?: string
  /** GOG and itch.io: the folder of the game inside `c:\games` */
  folder?: string
  /** GOG: the user Comet logs in with */
  username?: string
  /** itch.io: the executable of the game, relative to its folder */
  executable?: string
}): string {
  if (!STORES_WITH_RUNNER.includes(store))
    throw new Error(`There is no runner for the store "${store}"`)
  const gameName = title ? logName(title) : ''
  const variables: [string, string][] = [
    ['STORE', store],
    ['IDGAME', gameId(store, appName, folder, executable)],
    ...(gameName ? ([['GAMENAME', gameName]] as [string, string][]) : []),
    ...(store === 'gog'
      ? ([
          ['GAMEFOLDER', folder ?? ''],
          ['GOGUSER', username ?? ''],
          ['PLAYTASK', '0']
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
