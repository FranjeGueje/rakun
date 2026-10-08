import {
  EOS_OVERLAY_NAME,
  EOS_OVERLAY_VERSION,
  eosOverlayScriptText
} from '../eos_overlay_script'

jest.mock('backend/constants/paths', () => ({ rakunMountPath: '/mock/mount' }))
jest.mock('backend/logger', () => ({ logInfo: jest.fn() }))

const text = eosOverlayScriptText()
const lines = text.split('\n')
const at = (line: string) => lines.indexOf(line)

describe('the EOS Overlay script', () => {
  test('is the FranjeGueje EOS Overlay Installer, v1', () => {
    expect(EOS_OVERLAY_NAME).toBe('FranjeGueje EOS Overlay Installer')
    expect(EOS_OVERLAY_VERSION).toBe(1)
    expect(text).toContain('title FranjeGueje EOS Overlay Installer')
    expect(text).toContain('echo FranjeGueje EOS Overlay Installer v1')
  })

  test('starts with the configuration and the check of legendary.exe', () => {
    for (const line of [
      'set "LAUNCHERS=C:\\Launchers"',
      'set "LEGENDARY_CONFIG_PATH=%LAUNCHERS%\\Legendary"',
      'set "PATH=%PATH%;%LAUNCHERS%\\bin"',
      'if not exist "%LAUNCHERS%\\bin\\legendary.exe" (',
      '    echo [ERROR]: legendary.exe not found.'
    ])
      expect(lines).toContain(line)
    expect(at('set "LAUNCHERS=C:\\Launchers"')).toBeLessThan(
      at('if not exist "%LAUNCHERS%\\bin\\legendary.exe" (')
    )
  })

  test('enable comes first and its output (stdout and stderr) is kept to be searched', () => {
    const enable =
      'legendary eos-overlay enable --path %LAUNCHERS%\\eos > "%ENABLELOG%" 2>&1'
    expect(lines).toContain(enable)
    expect(at(enable)).toBeGreaterThan(
      at('if not exist "%LAUNCHERS%\\bin\\legendary.exe" (')
    )
    // Shown on the console too, so that it stays in the log
    expect(at('type "%ENABLELOG%"')).toBeGreaterThan(at(enable))
    expect(at('findstr /c:"ERROR" "%ENABLELOG%" >nul')).toBeGreaterThan(
      at('type "%ENABLELOG%"')
    )
  })

  test('without ERROR it only updates', () => {
    const update = '    legendary -y eos-overlay update --path %LAUNCHERS%\\eos'
    expect(at('if errorlevel 1 (')).toBeGreaterThan(-1)
    expect(at(update)).toBe(at('if errorlevel 1 (') + 1)
    // errorlevel 1 of findstr is «not found»: the next line closes that branch
    expect(lines[at(update) + 1]).toBe(') else (')
  })

  test('with ERROR it removes the overlay and then installs it again', () => {
    const remove = '    legendary -y eos-overlay remove --path %LAUNCHERS%\\eos'
    const install =
      '    legendary -y eos-overlay install --path %LAUNCHERS%\\eos'
    expect(at(remove)).toBeGreaterThan(at(') else ('))
    expect(at(install)).toBe(at(remove) + 1)
    expect(lines[at(install) + 1]).toBe(')')
  })

  test('install and update are not run every time, and enable does not take -y', () => {
    expect(text.match(/eos-overlay install/g)).toHaveLength(1)
    expect(text.match(/eos-overlay update/g)).toHaveLength(1)
    expect(text).not.toContain('enable --path %LAUNCHERS%\\eos -y')
    expect(text).not.toContain('-y eos-overlay enable')
  })

  test('cleans its log and ends with exit /b 0', () => {
    expect(lines).toContain('del "%ENABLELOG%" >nul 2>&1')
    expect(lines.at(-1)).toBe('exit /b 0')
  })
})
