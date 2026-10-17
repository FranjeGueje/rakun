import { COMET_BAT } from '../comet_script'
import {
  missingTool,
  SCRIPTS_DIR,
  section,
  storeBanner,
  type StoreScript
} from './bat'

/** `--prefer-task N` for gogdl when `PLAYTASK` is a number other than 0 (0 = the task GOG marks as primary); anything else is ignored */
const playTaskLines = [
  'set "RK_TASK="',
  'if defined PLAYTASK set "RK_TASK=--prefer-task %PLAYTASK% "',
  'if defined PLAYTASK for /f "delims=0123456789" %%a in ("%PLAYTASK%") do set "RK_TASK="',
  'if "%PLAYTASK%"=="0" set "RK_TASK="'
]

/** GOG: Comet is started first (achievements), then `gogdl launch` runs the game from `c:\games\<folder>` */
export const gogScript: StoreScript = {
  lines: [
    ...storeBanner(
      'gog',
      'IDGAME (the id of the game), GAMEFOLDER, GOGUSER and PLAYTASK.'
    ),
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
    '@gogdl --auth-config-path "%LAUNCHERS%\\gog_store\\auth.json" launch --platform windows %RK_TASK%"c:\\games\\%GAMEFOLDER%" %IDGAME% -- %*'
  ],
  variables: ({ folder, username }) => [
    ['GAMEFOLDER', folder ?? ''],
    ['GOGUSER', username ?? ''],
    ['PLAYTASK', '0']
  ]
}
