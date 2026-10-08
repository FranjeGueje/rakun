import { missingTool, section } from './runner_script'

export const EOS_OVERLAY_NAME = 'FranjeGueje EOS Overlay Installer'
export const EOS_OVERLAY_VERSION = 1

/**
 * The script that sets the EOS Overlay up in a new prefix. Legendary keeps
 * whether the overlay is installed in the config shared by every prefix, so with
 * the folder empty it can think the overlay is installed and enabled: `enable`
 * is the one command that notices (it fails), and it has no exit code to tell,
 * so its output (stdout and stderr together) is searched for ERROR.
 */
export function eosOverlayScriptText(): string {
  return [
    '@echo off',
    `title ${EOS_OVERLAY_NAME}`,
    '',
    `echo ${EOS_OVERLAY_NAME} v${EOS_OVERLAY_VERSION}`,
    'echo.',
    ...section('Configuration'),
    'set "LAUNCHERS=C:\\Launchers"',
    '',
    'set "LEGENDARY_CONFIG_PATH=%LAUNCHERS%\\Legendary"',
    'set "PATH=%PATH%;%LAUNCHERS%\\bin"',
    ...section('PRECHECKS'),
    ...missingTool('legendary.exe'),
    ...section('EOS OVERLAY'),
    'rem enable writes the registry entries of THIS prefix. Fails if the overlay',
    'rem is not really there (for instance an empty folder).',
    'set "ENABLELOG=%TEMP%\\rakun-eos-enable.log"',
    'legendary eos-overlay enable --path %LAUNCHERS%\\eos > "%ENABLELOG%" 2>&1',
    'type "%ENABLELOG%"',
    '',
    'rem findstr finds ERROR: errorlevel 0. Not found: errorlevel 1.',
    'findstr /c:"ERROR" "%ENABLELOG%" >nul',
    'if errorlevel 1 (',
    '    legendary -y eos-overlay update --path %LAUNCHERS%\\eos',
    ') else (',
    '    echo [EOS Overlay] enable failed: installing the overlay again',
    '    legendary -y eos-overlay remove --path %LAUNCHERS%\\eos',
    '    legendary -y eos-overlay install --path %LAUNCHERS%\\eos',
    ')',
    '',
    'del "%ENABLELOG%" >nul 2>&1',
    'exit /b 0'
  ].join('\n')
}
