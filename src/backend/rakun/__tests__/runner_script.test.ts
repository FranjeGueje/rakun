import {
  batValue,
  gameRunnerText,
  logName,
  runnerScriptText,
  RUNNER_BAT,
  RUNNER_NAME,
  RUNNER_VERSION,
  SCRIPTS_DIR,
  writeRunnerIni,
  writeRunnerScript
} from '../runner_script'

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn()
}))
jest.mock('backend/logger', () => ({ logInfo: jest.fn() }))
jest.mock('backend/constants/paths', () => ({ rakunMountPath: '/mock/mount' }))

import { existsSync, mkdirSync, writeFileSync } from 'fs'

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

  test('each store has its label between two bands, apart from the others', () => {
    const lines = text.split('\n')
    for (const store of ['legendary', 'gog', 'nile']) {
      const at = lines.indexOf(`:${store}`)
      expect(lines[at - 2]).toBe(`rem ${'/'.repeat(60)}`)
      expect(lines[at - 1]).toBe(`rem ${'*'.repeat(60)}`)
      expect(lines[at + 1]).toBe(`rem ${'*'.repeat(60)}`)
      expect(lines[at + 2]).toBe(`rem ${'\\'.repeat(60)}`)
    }
  })

  test('legendary: checks the tool, shows the status and launches the game', () => {
    const block = blockOf('legendary')
    expect(block).toContain('if not exist "%LAUNCHERS%\\bin\\legendary.exe" (')
    expect(block).toContain('if "%RK_SHOW_VERSIONS%"=="1" legendary status')
    expect(block).toContain('legendary launch %IDGAME% %*')
  })

  test('amazon: checks the tool and launches the game', () => {
    const block = blockOf('nile')
    expect(block).toContain('if not exist "%LAUNCHERS%\\bin\\nile.exe" (')
    expect(block).toContain(
      `if "%RK_SHOW_VERSIONS%"=="1" for /f "delims=" %%v in ('nile --version') do echo nile version: %%v`
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
    expect(block).toContain('if "%RK_SHOW_VERSIONS%"=="1" comet.exe --version')
    expect(block).not.toContain('dummy')
    expect(block).toContain(
      'call "%LAUNCHERS%\\scripts\\comet.bat" "%GOGUSER%"'
    )
    expect(block).toContain(
      '@gogdl --auth-config-path "%LAUNCHERS%\\gog_store\\auth.json" launch --platform windows %RK_TASK%"c:\\games\\%GAMEFOLDER%" %IDGAME% -- %*'
    )
  })

  test('GOG passes --prefer-task only for a PLAYTASK that is a number other than 0', () => {
    const block = blockOf('gog')
    for (const line of [
      'set "RK_TASK="',
      'if defined PLAYTASK set "RK_TASK=--prefer-task %PLAYTASK% "',
      'if defined PLAYTASK for /f "delims=0123456789" %%a in ("%PLAYTASK%") do set "RK_TASK="',
      'if "%PLAYTASK%"=="0" set "RK_TASK="'
    ])
      expect(block).toContain(line)
    expect(block.indexOf('set "RK_TASK="')).toBeLessThan(
      block.findIndex((line) => line.startsWith('@gogdl'))
    )
  })

  test('reads its options from the ini, with a default for each one', () => {
    for (const line of [
      'set "RK_SHOW_HEADER=1"',
      'set "RK_SHOW_VERSIONS=0"',
      'set "RK_LOG_TO_FILE=0"',
      'for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%LAUNCHERS%\\scripts\\Launcher_games.ini") do set "RK_%%a=%%b"',
      'if not "%RK_SHOW_HEADER%"=="0" ('
    ])
      expect(text).toContain(line)
  })

  test('with LOG_TO_FILE it runs again with its output in the log of the game', () => {
    expect(text).toContain(
      'if "%RK_LOG_TO_FILE%"=="1" if not defined RK_INLOG goto :logged'
    )
    expect(text).toContain(
      'call "%~f0" %* > "%LAUNCHERS%\\logs\\%GAMENAME%.log" 2>&1'
    )
    expect(text).toContain(
      'if not defined GAMENAME set "GAMENAME=%STORE%-%IDGAME%"'
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

describe('the options file', () => {
  const mockedExists = jest.mocked(existsSync)
  beforeEach(() => jest.clearAllMocks())

  test('is created next to the runner with the defaults', () => {
    mockedExists.mockReturnValue(false)

    const path = writeRunnerIni()

    expect(path).toBe('/mock/mount/scripts/Launcher_games.ini')
    const written = jest.mocked(writeFileSync).mock.calls[0][1] as string
    expect(written).toContain('\nSHOW_HEADER=1\n')
    expect(written).toContain('\nSHOW_VERSIONS=0\n')
    expect(written).toContain('\nLOG_TO_FILE=0\n')
  })

  test('is never overwritten: what the user wrote stays', () => {
    mockedExists.mockReturnValue(true)

    writeRunnerIni()

    expect(writeFileSync).not.toHaveBeenCalled()
  })
})

describe('the file of each game', () => {
  test('its title names the log: nothing a Windows file name refuses', () => {
    expect(logName('System Shock® 2: 25th Anniversary')).toBe(
      'System Shock® 2_ 25th Anniversary'
    )
    expect(logName('What? "Yes" | 100%.')).toBe('What_ _Yes_ _ 100_')
  })

  test('a game with a title carries it as GAMENAME, one without does not', () => {
    const named = gameRunnerText({ store: 'nile', appName: '1', title: 'A: B' })
    expect(named).toContain('set "GAMENAME=A_ B"')
    expect(gameRunnerText({ store: 'nile', appName: '1' })).not.toContain(
      'GAMENAME'
    )
  })

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
    expect(text).toContain('set "PLAYTASK=0"')
  })

  test('the stores that have no runner are refused', () => {
    expect(() => gameRunnerText({ store: 'zoom', appName: '1' })).toThrow(
      'There is no runner for the store "zoom"'
    )
  })
})
