import { missingTool, section, storeBanner, type StoreScript } from './bat'

/** Amazon Games: `nile launch <id>` */
export const nileScript: StoreScript = {
  lines: [
    ...storeBanner('nile', 'IDGAME, the id of the game.'),
    ...section('PRECHECKS'),
    ...missingTool('nile.exe'),
    ...section('START THE GAME'),
    `if "%RK_SHOW_VERSIONS%"=="1" for /f "delims=" %%v in ('nile --version') do echo nile version: %%v`,
    '',
    'nile launch %IDGAME% -- %*'
  ]
}
