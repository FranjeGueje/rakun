import {
  batValue,
  gameRunnerText,
  logName,
  runnerScriptText,
  RUNNER_BAT,
  RUNNER_NAME,
  RUNNER_VERSION,
  STORES_WITH_RUNNER,
  storeBatName,
  storeScriptText,
  writeRunnerIni,
  writeRunnerScript
} from '../runner_script'
import { SCRIPTS_DIR } from '../runner/bat'

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn()
}))
jest.mock('backend/logger', () => ({ logInfo: jest.fn() }))
jest.mock('backend/constants/paths', () => ({ rakunMountPath: '/mock/mount' }))

import { existsSync, mkdirSync, writeFileSync } from 'fs'

/** The lines of the script of one store */
const scriptOf = (store: (typeof STORES_WITH_RUNNER)[number]) =>
  storeScriptText(store).split('\n')

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

  test('calls the script of its store, refuses an unknown one and keeps the exit code', () => {
    expect(text).toContain('if "%STORE%"=="" (')
    expect(text).toContain('echo [ERROR]: STORE is not set.')
    expect(text).toContain(
      'set "RK_STORE_BAT=%LAUNCHERS%\\scripts\\store_%STORE%.bat"'
    )
    expect(text).toContain('if not exist "%RK_STORE_BAT%" (')
    expect(text).toContain('echo [ERROR]: unknown store "%STORE%".')
    expect(text).toContain('call "%RK_STORE_BAT%" %*')
    expect(text).toContain('set "RK_CODE=%errorlevel%"')
    expect(text.trimEnd()).toContain('exit /b %RK_CODE%')
  })

  test('the runner holds nothing of any store: each has a script of its own', () => {
    for (const tool of [
      'legendary launch',
      'gogdl',
      'nile launch',
      'dir /s /b'
    ])
      expect(text).not.toContain(tool)
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
    expect(text).toContain('call "%~f0" %* > "C:\\logs\\%GAMENAME%.log" 2>&1')
    expect(text).toContain(
      'if not defined GAMENAME set "GAMENAME=%STORE%-%IDGAME%"'
    )
    expect(text).toContain('set "GAMENAME=%GAMENAME:\\=_%"')
    expect(text).toContain('mkdir "C:\\logs" >nul 2>&1')
    expect(text).not.toContain('%LAUNCHERS%\\logs')
  })

  test('is written into the scripts folder of the mount, with the script of each store', () => {
    const path = writeRunnerScript()

    expect(path).toBe(`/mock/mount/${SCRIPTS_DIR}/${RUNNER_BAT}`)
    expect(path).toBe('/mock/mount/scripts/Launcher_games.bat')
    expect(mkdirSync).toHaveBeenCalledWith('/mock/mount/scripts', {
      recursive: true
    })
    expect(writeFileSync).toHaveBeenCalledWith(path, text, 'utf-8')
    for (const store of STORES_WITH_RUNNER)
      expect(writeFileSync).toHaveBeenCalledWith(
        `/mock/mount/scripts/store_${store}.bat`,
        storeScriptText(store),
        'utf-8'
      )
  })

  test('a store script is named store_<store>.bat', () => {
    expect(storeBatName('zoom')).toBe('store_zoom.bat')
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

  test('every store with a runner has its script', () => {
    expect(STORES_WITH_RUNNER).toEqual([
      'legendary',
      'gog',
      'nile',
      'itch',
      'zoom'
    ])
    for (const store of STORES_WITH_RUNNER) {
      const lines = scriptOf(store)
      expect(lines[0]).toBe('@echo off')
      expect(lines.length).toBeGreaterThan(5)
      expect(lines).toContain(`rem ${store}`)
      expect(lines).toContain(
        'rem Called by Launcher_games.bat after it sets up the common part: do not run it alone.'
      )
    }
  })

  test('no store script has the footer or a label of the runner: they come back to it', () => {
    for (const store of STORES_WITH_RUNNER) {
      const text = storeScriptText(store)
      expect(text).not.toContain('goto :end')
      expect(text).not.toContain('\n:end')
      expect(text).not.toContain('goto :eof')
    }
  })

  test('an itch game carries its executable as IDGAME, and none of the GOG variables', () => {
    const text = gameRunnerText({
      store: 'itch',
      appName: '21301',
      title: 'Pacapong',
      folder: 'pacapong',
      executable: 'bin/Pacapong.exe'
    })
    expect(text).toContain('set "STORE=itch"')
    expect(text).toContain('set "IDGAME=pacapong\\bin\\Pacapong.exe"')
    expect(text).toContain('set "GAMENAME=Pacapong"')
    expect(text).not.toContain('GAMEFOLDER')
    expect(text).not.toContain('GOGUSER')
  })

  test('an itch executable with a % keeps it: the value is escaped like any other', () => {
    const text = gameRunnerText({
      store: 'itch',
      appName: '1',
      folder: '100% Fun',
      executable: 'a.exe'
    })
    expect(text).toContain('set "IDGAME=100%% Fun\\a.exe"')
  })

  test('an itch game with no executable or no folder cannot have a runner', () => {
    for (const args of [
      { folder: 'game' },
      { executable: 'game.exe' },
      { folder: '', executable: '' }
    ])
      expect(() =>
        gameRunnerText({ store: 'itch', appName: '1', ...args })
      ).toThrow('The itch game has no executable to run')
  })

  test('the stores that have no runner are refused', () => {
    expect(() =>
      gameRunnerText({ store: 'steam' as never, appName: '1' })
    ).toThrow('There is no runner for the store "steam"')
  })

  test('zoom: a game with INSTALL_ONLY installs and stops, one without it does not say so', () => {
    expect(
      gameRunnerText({ store: 'zoom', appName: 'g', installOnly: true })
    ).toContain('set "INSTALL_ONLY=1"')
    expect(gameRunnerText({ store: 'zoom', appName: 'g' })).not.toContain(
      'INSTALL_ONLY'
    )
  })

  test('zoom: the installer is the only thing its .bat adds to the common variables', () => {
    const text = gameRunnerText({
      store: 'zoom',
      appName: 'guid',
      title: 'Gorky 17',
      executable: 'Gorky-17-Setup.exe'
    })
    expect(text).toContain('set "STORE=zoom"')
    expect(text).toContain('set "IDGAME=guid"')
    expect(text).toContain('set "INSTALLER=Gorky-17-Setup.exe"')
    expect(text).not.toContain('GAMEFOLDER')
  })
})
