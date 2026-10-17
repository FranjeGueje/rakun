import {
  missingTool,
  section,
  storeBanner,
  type GameOptions,
  type StoreScript
} from './bat'

/** `IDGAME` of an itch.io game: its executable under `c:\games`; butler gives the path with `/` and cmd needs `\` */
export const itchGameId = (folder: string, executable: string): string =>
  `${folder}\\${executable.replaceAll('/', '\\')}`

/**
 * itch.io has no tool of its own to run a game: `IDGAME` is the game's executable
 * as `<folder>\<path>` under `c:\games` (see `itchGameId`). It is run from its own
 * folder and waited for, so that Steam sees the game running until it closes.
 */
export const itchScript: StoreScript = {
  lines: [
    ...storeBanner('itch', 'IDGAME, the executable as <folder>\\<path>.'),
    ...section('PRECHECKS'),
    'set "RK_EXE=c:\\games\\%IDGAME%"',
    ...missingTool('game executable', '%RK_EXE%'),
    ...section('START THE GAME'),
    'for %%i in ("%RK_EXE%") do set "RK_DIR=%%~dpi"',
    'cd /d "%RK_DIR%"',
    'start "" /wait "%RK_EXE%" %*'
  ],
  idGame: ({ folder, executable }: GameOptions) => {
    if (!folder || !executable)
      throw new Error('The itch game has no executable to run')
    return itchGameId(folder, executable)
  }
}
