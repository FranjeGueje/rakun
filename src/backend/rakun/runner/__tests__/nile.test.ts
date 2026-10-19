import { nileScript } from '../nile'

describe('the script of Amazon', () => {
  const lines = nileScript.lines

  test('checks the tool and launches the game', () => {
    expect(lines).toContain('if not exist "%LAUNCHERS%\\bin\\nile.exe" (')
    expect(lines).toContain(
      `if "%RK_SHOW_VERSIONS%"=="1" for /f "delims=" %%v in ('nile --version') do echo nile version: %%v`
    )
    expect(lines).toContain('nile launch %IDGAME% -- %*')
  })

  test('takes nothing from the game but its id', () => {
    expect(nileScript.idGame).toBeUndefined()
    expect(nileScript.variables).toBeUndefined()
  })
})
