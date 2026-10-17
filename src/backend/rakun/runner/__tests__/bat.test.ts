import { missingTool, storeBanner } from '../bat'

describe('storeBanner', () => {
  test('puts the name of the store between two bands, apart from the rest', () => {
    const lines = storeBanner('gog', 'IDGAME.')
    expect(lines.slice(0, 5)).toEqual([
      `rem ${'/'.repeat(60)}`,
      `rem ${'*'.repeat(60)}`,
      'rem gog',
      `rem ${'*'.repeat(60)}`,
      `rem ${'\\'.repeat(60)}`
    ])
  })

  test('says who calls the script and what it expects', () => {
    expect(storeBanner('gog', 'IDGAME and GOGUSER.').slice(5)).toEqual([
      'rem Called by Launcher_games.bat after it sets up the common part: do not run it alone.',
      'rem It expects IDGAME and GOGUSER.'
    ])
  })
})

describe('missingTool', () => {
  test('stops the script when the tool of the mount is not there', () => {
    expect(missingTool('nile.exe')).toEqual([
      'if not exist "%LAUNCHERS%\\bin\\nile.exe" (',
      '    echo [ERROR]: nile.exe not found.',
      '    timeout /t 2 /nobreak >nul',
      '    exit /b 1',
      ')',
      ''
    ])
  })
})
