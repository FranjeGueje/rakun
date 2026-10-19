import { legendaryScript } from '../legendary'

describe('the script of Epic', () => {
  const lines = legendaryScript.lines

  test('checks the tool, shows the status and launches the game', () => {
    expect(lines).toContain('if not exist "%LAUNCHERS%\\bin\\legendary.exe" (')
    expect(lines).toContain('if "%RK_SHOW_VERSIONS%"=="1" legendary status')
    expect(lines).toContain('legendary launch %IDGAME% %*')
  })

  test('takes nothing from the game but its id', () => {
    expect(legendaryScript.idGame).toBeUndefined()
    expect(legendaryScript.variables).toBeUndefined()
  })
})
