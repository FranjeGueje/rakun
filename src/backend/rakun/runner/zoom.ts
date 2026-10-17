import {
  ZOOM_EXE_NAME,
  ZOOM_INF_NAME,
  ZOOM_INSTALLER_DIR
} from 'common/rakun/zoom'
import { missingTool, section, storeBanner, type StoreScript } from './bat'

const ZOOM_EXE_FILE = `C:\\${ZOOM_EXE_NAME}`

/**
 * Zoom's installer cannot run silent: the first launch runs it (with its window)
 * and deletes it when it ends well, and any later launch finds it gone and starts
 * the game. `INSTALLER` is its file name.
 *
 * The game's executable is the first `.exe` that is not an installer or a
 * redistributable (by its file name, not its path): `dir /o-s` puts the biggest
 * first. It is found once and kept in a file. With `INSTALL_ONLY` (rakun
 * installing now) the script ends there, without starting the game.
 */
const zoomLines = [
  ...storeBanner(
    'zoom',
    'IDGAME (the id of the game), INSTALLER and, to install and stop, INSTALL_ONLY.'
  ),
  ...section('INSTALL (first launch only)'),
  `set "RK_ZOOM_DIR=C:\\${ZOOM_INSTALLER_DIR}"`,
  'if defined INSTALLER if exist "%RK_ZOOM_DIR%\\%INSTALLER%" (',
  '    echo Installing the game ...',
  `    start "" /wait "%RK_ZOOM_DIR%\\%INSTALLER%" /NORESTART /SP- "/LOADINF=%RK_ZOOM_DIR%\\${ZOOM_INF_NAME}"`,
  '    if errorlevel 1 (',
  '        echo [ERROR]: the installer did not finish. Launch the game again to retry.',
  '        timeout /t 3 /nobreak >nul',
  '        exit /b 1',
  '    )',
  '    rmdir /s /q "%RK_ZOOM_DIR%"',
  `    del "${ZOOM_EXE_FILE}" >nul 2>&1`,
  ')',
  ...section('FIND THE GAME'),
  `if not exist "${ZOOM_EXE_FILE}" (`,
  '    setlocal enabledelayedexpansion',
  '    set "RK_FOUND="',
  '    for /f "delims=" %%f in (\'dir /s /b /a-d /o-s "C:\\ZOOM PLATFORM\\*.exe"\') do (',
  '        set "RK_C=%%~nxf"',
  '        if not defined RK_FOUND if "!RK_C:unins=!"=="!RK_C!" if "!RK_C:setup=!"=="!RK_C!" if "!RK_C:redist=!"=="!RK_C!" (',
  `            >"${ZOOM_EXE_FILE}" echo %%f`,
  '            set "RK_FOUND=1"',
  '        )',
  '    )',
  '    endlocal',
  ')',
  ...missingTool('game executable', ZOOM_EXE_FILE),
  'if "%INSTALL_ONLY%"=="1" exit /b 0',
  ...section('START THE GAME'),
  `set /p RK_EXE=<"${ZOOM_EXE_FILE}"`,
  'for %%i in ("%RK_EXE%") do set "RK_DIR=%%~dpi"',
  'cd /d "%RK_DIR%"',
  'start "" /wait "%RK_EXE%" %*'
]

export const zoomScript: StoreScript = {
  lines: zoomLines,
  variables: ({ executable, installOnly }) => [
    ['INSTALLER', executable ?? ''],
    ...(installOnly ? ([['INSTALL_ONLY', '1']] as [string, string][]) : [])
  ]
}
