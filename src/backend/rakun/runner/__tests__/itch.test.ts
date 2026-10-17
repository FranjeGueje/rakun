import { itchGameId, itchScript } from '../itch'

describe('the script of itch.io', () => {
  const lines = itchScript.lines

  test('checks the executable, runs it from its folder and waits for it', () => {
    expect(lines).toContain('set "RK_EXE=c:\\games\\%IDGAME%"')
    expect(lines).toContain('if not exist "%RK_EXE%" (')
    expect(lines).toContain('    exit /b 1')
    expect(lines).toContain('for %%i in ("%RK_EXE%") do set "RK_DIR=%%~dpi"')
    expect(lines).toContain('cd /d "%RK_DIR%"')
    expect(lines).toContain('start "" /wait "%RK_EXE%" %*')
  })
})

describe('itchGameId', () => {
  test('is the folder and the path of the executable, with the slashes cmd needs', () => {
    expect(itchGameId('pacapong', 'pacapong.exe')).toBe(
      'pacapong\\pacapong.exe'
    )
    expect(itchGameId('game', 'bin/win/Game.exe')).toBe(
      'game\\bin\\win\\Game.exe'
    )
  })

  test('is the IDGAME of the game', () => {
    expect(
      itchScript.idGame?.({
        appName: '1',
        folder: 'pacapong',
        executable: 'bin/Pacapong.exe'
      })
    ).toBe('pacapong\\bin\\Pacapong.exe')
  })

  test('cannot be had without an executable or a folder', () => {
    for (const options of [
      { folder: 'game' },
      { executable: 'game.exe' },
      { folder: '', executable: '' }
    ])
      expect(() => itchScript.idGame?.({ appName: '1', ...options })).toThrow(
        'The itch game has no executable to run'
      )
  })
})
