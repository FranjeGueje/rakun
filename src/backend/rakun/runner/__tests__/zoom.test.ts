import { zoomScript } from '../zoom'

describe('the script of Zoom', () => {
  const lines = zoomScript.lines

  test('installs once, with its window, and then starts the game it found', () => {
    expect(lines).toContain(
      'if defined INSTALLER if exist "%RK_ZOOM_DIR%\\%INSTALLER%" ('
    )
    expect(lines).toContain(
      '    start "" /wait "%RK_ZOOM_DIR%\\%INSTALLER%" /NORESTART /SP- "/LOADINF=%RK_ZOOM_DIR%\\zoom_installer.inf"'
    )
    expect(lines).toContain('    if errorlevel 1 (')
    expect(lines).toContain('    rmdir /s /q "%RK_ZOOM_DIR%"')
    expect(lines).toContain('start "" /wait "%RK_EXE%" %*')
  })

  test('tells an installer or redistributable by its file name, not by the folder it is in', () => {
    const text = lines.join('\n')
    expect(text).toContain('set "RK_C=%%~nxf"')
    expect(text).toContain('"!RK_C:unins=!"=="!RK_C!"')
    expect(text).toContain('"!RK_C:setup=!"=="!RK_C!"')
    expect(text).toContain('"!RK_C:redist=!"=="!RK_C!"')
    expect(text).toContain('echo %%f')
  })

  test('with INSTALL_ONLY it ends once the game is found, before starting it', () => {
    const stop = lines.indexOf('if "%INSTALL_ONLY%"=="1" exit /b 0')
    expect(stop).toBeGreaterThan(-1)
    expect(stop).toBeLessThan(lines.indexOf('start "" /wait "%RK_EXE%" %*'))
  })

  test('reads the installer from the game, and INSTALL_ONLY only when asked', () => {
    expect(
      zoomScript.variables?.({ appName: 'g', executable: 'Setup.exe' })
    ).toEqual([['INSTALLER', 'Setup.exe']])
    expect(
      zoomScript.variables?.({
        appName: 'g',
        executable: 'Setup.exe',
        installOnly: true
      })
    ).toEqual([
      ['INSTALLER', 'Setup.exe'],
      ['INSTALL_ONLY', '1']
    ])
  })
})
