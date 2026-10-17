/** Folder of the mount for the scripts that run inside the prefixes */
export const SCRIPTS_DIR = 'scripts'

const RULE = 'rem ============================================================'
export const section = (title: string) => ['', RULE, `rem ${title}`, RULE, '']

/** Stops the script when a tool of the mount is not there */
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

/**
 * What opens the script of a store: its name between two bands, so it stands
 * out, and a note on who calls it and with what (`expects`: the variables the
 * `.bat` of the game sets for it, besides `STORE`).
 */
export const storeBanner = (store: string, expects: string) => [
  `rem ${'/'.repeat(60)}`,
  `rem ${'*'.repeat(60)}`,
  `rem ${store}`,
  `rem ${'*'.repeat(60)}`,
  `rem ${'\\'.repeat(60)}`,
  'rem Called by Launcher_games.bat after it sets up the common part: do not run it alone.',
  `rem It expects ${expects}`
]

/** What a game gives to build its `.bat`; each store takes what it needs */
export type GameOptions = {
  appName: string
  /** GOG and itch.io: the folder of the game inside `c:\games` */
  folder?: string
  /** GOG: the user Comet logs in with */
  username?: string
  /** itch.io: the executable of the game, relative to its folder; Zoom: the file name of its installer */
  executable?: string
  /** Zoom: install the game and stop, instead of starting it */
  installOnly?: boolean
}

/** The script of a store and the variables of the `.bat` of a game that it reads */
export type StoreScript = {
  lines: string[]
  /** `IDGAME`, when it is not the id of the game in the store */
  idGame?: (options: GameOptions) => string
  /** The variables of the store, besides `STORE`, `IDGAME` and `GAMENAME` */
  variables?: (options: GameOptions) => [string, string][]
}
