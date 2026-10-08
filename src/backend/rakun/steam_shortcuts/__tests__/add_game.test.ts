import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { basename, dirname, join } from 'path'
import { DirResult, dirSync } from '../../../__tests__/tmp_dir'
import { addGameToSteam, createRakunBat, createRunnerFile } from '../add_game'
import { GameInfo } from 'common/types'
import * as steamHelpers from '../steam_helpers'
import { spawnAsync } from 'backend/utils'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn()
}))
jest.mock('backend/config')
jest.mock('backend/utils', () => ({
  spawnAsync: jest.fn()
}))
jest.mock('../steam_helpers', () => ({
  findGameInAllUsers: jest.fn(),
  getShortcutId: jest.fn(),
  checkSteamProtocolHandler: jest.fn()
}))

let mockRakunRunnerPath = '/tmp/default-rakun-runner'
let mockRakunGamesPath = '/tmp/default-rakun-games'
jest.mock('backend/constants/paths', () => ({
  get rakunRunnerPath() {
    return mockRakunRunnerPath
  },
  get rakunGamesPath() {
    return mockRakunGamesPath
  },
  rakunMountPath: '/tmp/mount',
  rakunInstallPath: '/tmp/games'
}))

const mockedFindGameInAllUsers = jest.mocked(steamHelpers.findGameInAllUsers)
const mockedGetShortcutId = jest.mocked(steamHelpers.getShortcutId)

describe('addGameToSteam', () => {
  let tmpDir: DirResult

  beforeEach(() => {
    tmpDir = dirSync()
    jest.clearAllMocks()
    mockedFindGameInAllUsers.mockReturnValue({ entry: null, found: false })
  })

  afterEach(() => {
    tmpDir.removeCallback()
  })

  test('returns error when steam:// URL fails to open', async () => {
    jest.mocked(spawnAsync).mockRejectedValue(new Error('xdg-open not found'))

    const result = await addGameToSteam({
      gameName: 'MyGame',
      runnerPath: '/tmp/MyGame.bat'
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to open steam:// URL')
  })

  test('returns success when game is added correctly', async () => {
    mockedFindGameInAllUsers.mockReturnValueOnce({
      found: true,
      entry: { appid: 456, AppName: 'MyGame' },
      error: undefined
    })
    mockedGetShortcutId.mockReturnValue(456)
    const result = await addGameToSteam({
      gameName: 'MyGame',
      runnerPath: '/tmp/MyGame.bat'
    })

    expect(result.success).toBe(true)
    expect(result.steamAppId).toBe(456)
  })

  describe('temporary .desktop launcher', () => {
    const desktopPathFromUrl = (url: string) =>
      decodeURIComponent(url.replace('steam://addnonsteamgame/', ''))

    // Steam is mocked to "add" the game as soon as xdg-open is called; the
    // .desktop is captured then because it is deleted when the call returns.
    function captureDesktop(): { path: string; content: string }[] {
      const captured: { path: string; content: string }[] = []
      jest.mocked(spawnAsync).mockImplementation(async (_cmd, args) => {
        const path = desktopPathFromUrl(args[0])
        captured.push({ path, content: readFileSync(path, 'utf-8') })
        return { code: 0, stdout: '', stderr: '' }
      })
      mockedFindGameInAllUsers
        .mockReturnValueOnce({ entry: null, found: false })
        .mockReturnValue({ entry: { appid: 1 }, found: true })
      mockedGetShortcutId.mockReturnValue(1)
      return captured
    }

    test('passes Steam a .desktop with the game name and runner', async () => {
      const captured = captureDesktop()

      await addGameToSteam({
        gameName: 'My Game',
        runnerPath: '/home/user/runner/My Game.bat'
      })

      expect(captured).toHaveLength(1)
      expect(captured[0].path.startsWith(tmpdir())).toBe(true)
      expect(captured[0].content).toBe(
        [
          '[Desktop Entry]',
          'Type=Application',
          'Name=My Game',
          'Exec="/home/user/runner/My Game.bat"',
          'Path=/home/user/runner',
          'Terminal=false',
          ''
        ].join('\n')
      )
    })

    test('makes the runner executable so Steam parses the .desktop', async () => {
      captureDesktop()
      const runner = join(tmpDir.name, 'Game.bat')
      writeFileSync(runner, '@echo off', { mode: 0o644 })

      await addGameToSteam({ gameName: 'Game', runnerPath: runner })

      expect(statSync(runner).mode & 0o111).toBe(0o111)
    })

    test('escapes special characters in Name and Exec', async () => {
      const captured = captureDesktop()

      await addGameToSteam({
        gameName: 'Line1\nLine2',
        runnerPath: '/tmp/a"b$c.bat'
      })

      expect(captured[0].content).toContain('Name=Line1\\nLine2\n')
      expect(captured[0].content).toContain('Exec="/tmp/a\\"b\\$c.bat"\n')
    })

    test('removes the temporary .desktop when Steam adds the game', async () => {
      const captured = captureDesktop()

      await addGameToSteam({ gameName: 'MyGame', runnerPath: '/tmp/a.bat' })

      expect(existsSync(captured[0].path)).toBe(false)
      expect(existsSync(dirname(captured[0].path))).toBe(false)
    })

    test('removes the temporary .desktop when xdg-open fails', async () => {
      let desktopPath = ''
      jest.mocked(spawnAsync).mockImplementation(async (_cmd, args) => {
        desktopPath = desktopPathFromUrl(args[0])
        throw new Error('xdg-open not found')
      })

      const result = await addGameToSteam({
        gameName: 'MyGame',
        runnerPath: '/tmp/a.bat'
      })

      expect(result.success).toBe(false)
      expect(existsSync(dirname(desktopPath))).toBe(false)
    })

    test('skips Steam when the game title already exists', async () => {
      mockedFindGameInAllUsers.mockReturnValue({
        entry: { appid: 7 },
        found: true
      })
      mockedGetShortcutId.mockReturnValue(7)

      const result = await addGameToSteam({
        gameName: 'MyGame',
        runnerPath: '/tmp/a.bat'
      })

      expect(result).toEqual({ success: true, steamAppId: 7, existed: true })
      expect(spawnAsync).not.toHaveBeenCalled()
    })
  })
})

describe('createRakunBat', () => {
  let tmpDir: DirResult

  beforeEach(() => {
    tmpDir = dirSync()
    mockRakunRunnerPath = tmpDir.name
    jest.clearAllMocks()
  })

  afterEach(() => {
    tmpDir.removeCallback()
  })

  const lines = (path: string) => readFileSync(path, 'utf-8').split('\n')

  test('a legendary game gets its store and id and a call to the runner of the mount', () => {
    const runnerPath = createRakunBat(
      tmpDir.name,
      'TestGame',
      'legendary',
      'abc123'
    )

    expect(runnerPath).toBe(join(tmpDir.name, 'TestGame.bat'))
    expect(lines(runnerPath)).toEqual([
      '@echo off',
      'rem FranjeGueje runner: the logic is in C:\\Launchers\\scripts\\Launcher_games.bat',
      'set "STORE=legendary"',
      'set "IDGAME=abc123"',
      'call "C:\\Launchers\\scripts\\Launcher_games.bat" %*',
      'exit /b %errorlevel%'
    ])
  })

  test('an Amazon game needs the same two variables', () => {
    const runnerPath = createRakunBat(
      tmpDir.name,
      'AmazonGame',
      'nile',
      'nile789'
    )
    const content = lines(runnerPath)
    expect(content).toContain('set "STORE=nile"')
    expect(content).toContain('set "IDGAME=nile789"')
    expect(content.filter((line) => line.startsWith('set '))).toHaveLength(2)
  })

  test('a GOG game also carries its folder and the user of Comet', () => {
    const runnerPath = createRakunBat(tmpDir.name, 'GogGame', 'gog', 'gog123')
    const content = lines(runnerPath)

    expect(content).toContain('set "STORE=gog"')
    expect(content).toContain('set "IDGAME=gog123"')
    expect(content).toContain(`set "GAMEFOLDER=${basename(tmpDir.name)}"`)
    expect(content).toContain('set "GOGUSER="')
  })

  test('has no logic of its own: that is in the runner', () => {
    const content = readFileSync(
      createRakunBat(tmpDir.name, 'G', 'legendary', 'a'),
      'utf-8'
    )
    expect(content).not.toMatch(/legendary launch|gogdl|goto|if not exist/)
  })

  test('Zoom has no runner', () => {
    expect(() =>
      createRakunBat('/some/path/ZoomGame', 'ZoomGame', 'zoom', '')
    ).toThrow('There is no runner for the store "zoom"')
  })

  test('overwrites existing file with new content', () => {
    mkdirSync(tmpDir.name, { recursive: true })
    const runnerPath = join(tmpDir.name, 'ExistingGame.bat')
    writeFileSync(runnerPath, 'old content', 'utf-8')

    const result = createRakunBat(
      tmpDir.name,
      'ExistingGame',
      'legendary',
      'abc'
    )

    expect(result).toBe(runnerPath)
    const content = readFileSync(runnerPath, 'utf-8')
    expect(content).toContain('set "IDGAME=abc"')
    expect(content).not.toBe('old content')
  })
})

describe('createRunnerFile', () => {
  let installDir: DirResult
  let gamesDir: DirResult
  let runnerDir: DirResult

  beforeEach(() => {
    installDir = dirSync()
    gamesDir = dirSync()
    runnerDir = dirSync()
    mockRakunGamesPath = gamesDir.name
    mockRakunRunnerPath = runnerDir.name
  })

  afterEach(() => {
    installDir.removeCallback()
    gamesDir.removeCallback()
    runnerDir.removeCallback()
  })

  test('zoom: symlinks the install path into rakunGamesPath and points at the executable through it', () => {
    const gameInfo = {
      runner: 'zoom',
      install: { executable: 'drive_c/Game/game.exe' }
    } as unknown as GameInfo

    const result = createRunnerFile(gameInfo, installDir.name)

    expect('path' in result).toBe(true)
    const linkPath = join(gamesDir.name, basename(installDir.name))
    expect(existsSync(linkPath)).toBe(true)
    expect((result as { path: string }).path).toBe(
      join(linkPath, 'drive_c/Game/game.exe')
    )
  })

  test('zoom: returns an error when there is no executable', () => {
    const gameInfo = {
      runner: 'zoom',
      install: { executable: '' }
    } as unknown as GameInfo

    const result = createRunnerFile(gameInfo, installDir.name)

    expect(result).toEqual({ error: 'No executable found for Zoom game' })
  })

  test('non-zoom: creates a .bat runner file', () => {
    const gameInfo = {
      runner: 'legendary',
      title: 'LegGame',
      app_name: 'leg_app',
      install: {}
    } as unknown as GameInfo

    const result = createRunnerFile(gameInfo, installDir.name)

    expect((result as { path: string }).path).toBe(
      join(mockRakunRunnerPath, 'LegGame.bat')
    )
  })
})
