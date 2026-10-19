import { missingTool, section, storeBanner, type StoreScript } from './bat'

/** Epic Games: `legendary launch <id>` */
export const legendaryScript: StoreScript = {
  lines: [
    ...storeBanner('legendary', 'IDGAME, the id of the game.'),
    ...section('PRECHECKS'),
    ...missingTool('legendary.exe'),
    ...section('START THE GAME'),
    'if "%RK_SHOW_VERSIONS%"=="1" legendary status',
    '',
    'legendary launch %IDGAME% %*'
  ]
}
