import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { rakunMountPath } from 'backend/constants/paths'
import { logInfo } from 'backend/logger'
import { COMET_BAT, SCRIPTS_DIR, section } from './runner_script'

const LOG_PREFIX = 'Rakun'

export const COMET_SERVICE_NAME = 'FranjeGueje Comet Service'
export const COMET_SERVICE_VERSION = 1

/**
 * The script that starts Comet inside a prefix, called by the runner of a GOG
 * game with the GOG user as its only argument. It keeps the files of gog_store
 * up to date, makes sure the GalaxyCommunication service exists and leaves
 * Comet running in the background.
 */
export function cometScriptText(): string {
  return [
    '@echo off',
    `title ${COMET_SERVICE_NAME}`,
    ...section('Prechecks'),
    'if "%~1"=="" goto :bad_arguments',
    'if not "%~2"=="" goto :bad_arguments',
    ...section('Configuration'),
    `echo ${COMET_SERVICE_NAME} v${COMET_SERVICE_VERSION}`,
    'echo.',
    '',
    'set "GOGUSER=%~1"',
    'set "LAUNCHERS=C:\\Launchers"',
    'set "ORIGINFILE=%LAUNCHERS%\\bin\\GalaxyCommunication.exe"',
    'set "TARGETDIR=C:\\ProgramData\\GOG.com\\Galaxy\\redists"',
    '',
    'rem Always update the files of gog_store',
    'mkdir "%APPDATA%\\heroic\\gog_store" >nul 2>&1',
    'copy "%LAUNCHERS%\\gog_store\\*" "%APPDATA%\\heroic\\gog_store\\" >nul 2>&1',
    'cd /d "%LAUNCHERS%\\bin\\"',
    'if not exist "%TARGETDIR%" mkdir "%TARGETDIR%"',
    'xcopy /y /q "%ORIGINFILE%" "%TARGETDIR%\\" >nul 2>&1',
    ...section('CHECKS AND INSTALLATIONS'),
    'rem GalaxyCommunication Service',
    'sc query "GalaxyCommunication" >nul 2>&1',
    'if not %errorlevel% equ 0 (',
    '    sc create "GalaxyCommunication" binpath= "%TARGETDIR%\\GalaxyCommunication.exe"',
    ')',
    '"%LAUNCHERS%\\bin\\update-permissions.exe" >nul 2>&1',
    ...section('START COMET'),
    'echo ---------------------------------------------------------',
    'echo COMET IS RUNNING.',
    "echo If you've closed the game, you can close this window now.",
    'echo ---------------------------------------------------------',
    'mkdir "%LAUNCHERS%\\logs" >nul 2>&1',
    'start "" /b "%LAUNCHERS%\\bin\\comet.exe" --from-heroic --username "%GOGUSER%" >"%LAUNCHERS%\\logs\\comet.log" 2>&1',
    'goto :eof',
    '',
    ':bad_arguments',
    'echo [ERROR]: this script requires exactly one argument.',
    'echo.',
    'echo Usage:',
    'echo %~nx0 "GOG_USER"',
    'echo.',
    'exit /b 1'
  ].join('\n')
}

/** Writes the script into the mount, rewritten at every start so a new version reaches every game */
export function writeCometScript(): string {
  const dir = join(rakunMountPath, SCRIPTS_DIR)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, COMET_BAT)
  writeFileSync(path, cometScriptText(), 'utf-8')
  logInfo(
    `Created ${path} (${COMET_SERVICE_NAME} v${COMET_SERVICE_VERSION})`,
    LOG_PREFIX
  )
  return path
}
