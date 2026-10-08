import {
  batValue,
  gameRunnerText,
  runnerScriptText,
  RUNNER_BAT,
  RUNNER_NAME,
  RUNNER_VERSION,
  SCRIPTS_DIR,
  writeRunnerScript
} from '../runner_script'

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn()
}))
jest.mock('backend/logger', () => ({ logInfo: jest.fn() }))
jest.mock('backend/constants/paths', () => ({ rakunMountPath: '/mock/mount' }))

import { mkdirSync, writeFileSync } from 'fs'

/** The lines of one store: from its label up to the next `goto :end` */
const blockOf = (label: string) => {
  const lines = runnerScriptText().split('\n')
  const start = lines.indexOf(`:${label}`)
  const end = lines.indexOf('goto :end', start)
  return lines.slice(start, end + 1)
}

describe('the runner script', () => {
  const text = runnerScriptText()

  test('is called FranjeGueje runner and starts at version 1', () => {
    expect(RUNNER_NAME).toBe('FranjeGueje runner')
    expect(RUNNER_VERSION).toBe(1)
    expect(text).toContain('title FranjeGueje runner')
    expect(text).toContain('echo FranjeGueje runner v1')
  })

  test('keeps the common configuration of the earlier runners', () => {
    for (const line of [
      'set "LAUNCHERS=C:\\Launchers"',
      'set "LEGENDARY_CONFIG_PATH=%LAUNCHERS%\\Legendary"',
      'set "NILE_CONFIG_PATH=%LAUNCHERS%"',
      'set "GOGDL_CONFIG_PATH=%LAUNCHERS%"',
      'set "PATH=%PATH%;%LAUNCHERS%\\bin"'
    ])
      expect(text).toContain(line)
  })

  test('goes to the block of its store, whatever the case, and refuses the rest', () => {
    for (const store of ['legendary', 'gog', 'nile'])
      expect(text).toContain(`if /i "%STORE%"=="${store}" goto :${store}`)
    expect(text).toContain('if "%STORE%"=="" (')
    expect(text).toContain('echo [ERROR]: STORE is not set.')
    expect(text).toContain('echo [ERROR]: unknown store "%STORE%".')
  })

  test('legendary: checks the tool, shows the status and launches the game', () => {
    const block = blockOf('legendary')
    expect(block).toContain('if not exist "%LAUNCHERS%\\bin\\legendary.exe" (')
    expect(block).toContain('legendary status')
    expect(block).toContain('legendary launch %IDGAME% %*')
  })

  test('amazon: checks the tool and launches the game', () => {
    const block = blockOf('nile')
    expect(block).toContain('if not exist "%LAUNCHERS%\\bin\\nile.exe" (')
    expect(block).toContain(
      `for /f "delims=" %%v in ('nile --version') do echo nile version: %%v`
    )
    expect(block).toContain('nile launch %IDGAME% -- %*')
  })

  test('gog: checks its tools and login, starts Comet and launches the game', () => {
    const block = blockOf('gog')
    expect(block).toContain('if not exist "%LAUNCHERS%\\bin\\gogdl.exe" (')
    expect(block).toContain('if not exist "%LAUNCHERS%\\bin\\comet.exe" (')
    expect(block).toContain(
      'if not exist "%LAUNCHERS%\\gog_store\\auth.json" ('
    )
    expect(block).toContain('mkdir "%APPDATA%\\heroic\\gog_store" >nul 2>&1')
    expect(block).toContain(
      'copy "%LAUNCHERS%\\gog_store\\*" "%APPDATA%\\heroic\\gog_store\\" >nul 2>&1'
    )
    expect(block).toContain('cd /d "%LAUNCHERS%\\bin\\"')
    expect(block).toContain('comet.exe --version')
    expect(block).toContain('start "" /b "install-dummy-service.bat" >nul 2>&1')
    expect(block).toContain(
      'start "" /b "comet.exe" --from-heroic --username "%GOGUSER%" >nul 2>&1'
    )
    expect(block).toContain(
      '@gogdl --auth-config-path c:\\Launchers\\gog_store\\auth.json launch --platform windows "c:\\games\\%GAMEFOLDER%" %IDGAME% -- %*'
    )
  })

  test('only a GOG game ends saying that Comet is running', () => {
    expect(blockOf('gog')).toContain('set "COMETNOTE=1"')
    expect(blockOf('legendary').join('\n')).not.toContain('COMETNOTE')
    expect(text).toContain('if defined COMETNOTE echo COMET IS RUNNING.')
    expect(text).toContain(
      "echo If you've closed the game, you can close this window now."
    )
  })

  test('is written into the scripts folder of the mount', () => {
    const path = writeRunnerScript()

    expect(path).toBe(`/mock/mount/${SCRIPTS_DIR}/${RUNNER_BAT}`)
    expect(path).toBe('/mock/mount/scripts/Launcher_games.bat')
    expect(mkdirSync).toHaveBeenCalledWith('/mock/mount/scripts', {
      recursive: true
    })
    expect(writeFileSync).toHaveBeenCalledWith(path, text, 'utf-8')
  })
})

describe('the file of each game', () => {
  test('a value cannot break its line: % is doubled, quotes and line breaks go', () => {
    expect(batValue('100% Orange "Juice"\r\n')).toBe('100%% Orange Juice')
  })

  test('a GOG game with a special name still sets its folder in one line', () => {
    const text = gameRunnerText({
      store: 'gog',
      appName: '1',
      folder: '50% Off & More',
      username: 'a"b'
    })
    expect(text).toContain('set "GAMEFOLDER=50%% Off & More"')
    expect(text).toContain('set "GOGUSER=ab"')
  })

  test('the stores that have no runner are refused', () => {
    expect(() => gameRunnerText({ store: 'zoom', appName: '1' })).toThrow(
      'There is no runner for the store "zoom"'
    )
  })
})
