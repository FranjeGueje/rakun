import {
  COMET_SERVICE_NAME,
  COMET_SERVICE_VERSION,
  cometScriptText,
  writeCometScript
} from '../comet_script'

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn()
}))
jest.mock('backend/logger', () => ({ logInfo: jest.fn() }))
jest.mock('backend/constants/paths', () => ({ rakunMountPath: '/mock/mount' }))

import { mkdirSync, writeFileSync } from 'fs'

const text = cometScriptText()
const lines = text.split('\n')

describe('the Comet script', () => {
  test('is the FranjeGueje Comet Service, v1', () => {
    expect(COMET_SERVICE_NAME).toBe('FranjeGueje Comet Service')
    expect(COMET_SERVICE_VERSION).toBe(1)
    expect(text).toContain('title FranjeGueje Comet Service')
    expect(text).toContain('echo FranjeGueje Comet Service v1')
  })

  test('needs exactly one argument, the GOG user', () => {
    expect(lines).toContain('if "%~1"=="" goto :bad_arguments')
    expect(lines).toContain('if not "%~2"=="" goto :bad_arguments')
    expect(lines).toContain('set "GOGUSER=%~1"')
    expect(lines).toContain(':bad_arguments')
  })

  test('updates gog_store, creates the service and starts Comet', () => {
    for (const line of [
      'copy "%LAUNCHERS%\\gog_store\\*" "%APPDATA%\\heroic\\gog_store\\" >nul 2>&1',
      'xcopy /y /q "%ORIGINFILE%" "%TARGETDIR%\\" >nul 2>&1',
      '    sc create "GalaxyCommunication" binpath= "%TARGETDIR%\\GalaxyCommunication.exe"',
      '"%LAUNCHERS%\\bin\\update-permissions.exe" >nul 2>&1',
      'start "" /b "%LAUNCHERS%\\bin\\comet.exe" --from-heroic --username "%GOGUSER%" >"C:\\logs\\comet.log" 2>&1'
    ])
      expect(lines).toContain(line)
  })

  test('does not use the dummy service installer', () => {
    expect(text).not.toContain('dummy')
  })

  test('is written into the scripts folder of the mount', () => {
    const path = writeCometScript()

    expect(path).toBe('/mock/mount/scripts/comet.bat')
    expect(mkdirSync).toHaveBeenCalledWith('/mock/mount/scripts', {
      recursive: true
    })
    expect(writeFileSync).toHaveBeenCalledWith(path, text, 'utf-8')
  })
})
