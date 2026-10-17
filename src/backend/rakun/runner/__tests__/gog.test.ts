import { gogScript } from '../gog'

describe('the script of GOG', () => {
  const lines = gogScript.lines

  test('checks its tools and login, starts Comet and launches the game', () => {
    expect(lines).toContain('if not exist "%LAUNCHERS%\\bin\\gogdl.exe" (')
    expect(lines).toContain('if not exist "%LAUNCHERS%\\bin\\comet.exe" (')
    expect(lines).toContain(
      'if not exist "%LAUNCHERS%\\gog_store\\auth.json" ('
    )
    expect(lines).toContain('if "%RK_SHOW_VERSIONS%"=="1" comet.exe --version')
    expect(lines.join('\n')).not.toContain('dummy')
    expect(lines).toContain(
      'call "%LAUNCHERS%\\scripts\\comet.bat" "%GOGUSER%"'
    )
    expect(lines).toContain(
      '@gogdl --auth-config-path "%LAUNCHERS%\\gog_store\\auth.json" launch --platform windows %RK_TASK%"c:\\games\\%GAMEFOLDER%" %IDGAME% -- %*'
    )
  })

  test('passes --prefer-task only for a PLAYTASK that is a number other than 0', () => {
    for (const line of [
      'set "RK_TASK="',
      'if defined PLAYTASK set "RK_TASK=--prefer-task %PLAYTASK% "',
      'if defined PLAYTASK for /f "delims=0123456789" %%a in ("%PLAYTASK%") do set "RK_TASK="',
      'if "%PLAYTASK%"=="0" set "RK_TASK="'
    ])
      expect(lines).toContain(line)
    expect(lines.indexOf('set "RK_TASK="')).toBeLessThan(
      lines.findIndex((line) => line.startsWith('@gogdl'))
    )
  })

  test('reads the folder, the user and the play task from the game', () => {
    expect(
      gogScript.variables?.({ appName: '1', folder: 'Game', username: 'me' })
    ).toEqual([
      ['GAMEFOLDER', 'Game'],
      ['GOGUSER', 'me'],
      ['PLAYTASK', '0']
    ])
    expect(gogScript.variables?.({ appName: '1' })).toEqual([
      ['GAMEFOLDER', ''],
      ['GOGUSER', ''],
      ['PLAYTASK', '0']
    ])
  })
})
