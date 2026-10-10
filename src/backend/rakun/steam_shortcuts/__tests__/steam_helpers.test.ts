import { copyFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { DirResult, dirSync } from '../../../__tests__/tmp_dir'
import { GlobalConfig } from 'backend/config'
import {
  getShortcutId,
  readShortcutsVdf,
  getExe,
  findShortcutInAllUsers
} from '../steam_helpers'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn()
}))
jest.mock('backend/config')

const TEST_VDF_DIR = join(__dirname, 'test_data')

let tmpDir: DirResult
let tmpUserdataDir: string
let tmpConfigDir: string

function copyValidTestVdf(): string {
  const dest = join(tmpConfigDir, 'shortcuts.vdf')
  copyFileSync(join(TEST_VDF_DIR, 'shortcuts_valid.vdf'), dest)
  return dest
}

describe('steam_helpers', () => {
  beforeEach(() => {
    tmpDir = dirSync()
    GlobalConfig.setConfigValue('defaultSteamPath', tmpDir.name)
    tmpUserdataDir = join(tmpDir.name, 'userdata', 'steam_user')
    tmpConfigDir = join(tmpUserdataDir, 'config')
    mkdirSync(tmpConfigDir, { recursive: true })
  })

  afterEach(() => {
    tmpDir.removeCallback()
  })

  describe('getShortcutId', () => {
    test('returns appid when it is a number', () => {
      const entry = { appid: 42, AppName: 'Game' }
      expect(getShortcutId(entry)).toBe(42)
    })

    test('returns 0 when appid is false (autoConvertBooleans bug)', () => {
      const entry = { appid: false, AppName: 'Game' }
      expect(getShortcutId(entry)).toBe(0)
    })

    test('returns 0 when appid is null', () => {
      const entry = { appid: null, AppName: 'Game' }
      expect(getShortcutId(entry)).toBe(0)
    })

    test('returns 0 when appid is missing', () => {
      const entry = { AppName: 'Game' }
      expect(getShortcutId(entry)).toBe(0)
    })

    test('returns unsigned appid for negative value', () => {
      const entry = { appid: -164687467, AppName: 'Game' }
      expect(getShortcutId(entry)).toBe(-164687467 >>> 0)
    })
  })

  describe('readShortcutsVdf', () => {
    test('returns null when file does not exist', () => {
      const result = readShortcutsVdf('/nonexistent/shortcuts.vdf')
      expect(result).toBeNull()
    })

    test('returns parsed object when file exists', () => {
      copyValidTestVdf()
      const shortcutsFile = join(tmpConfigDir, 'shortcuts.vdf')
      const result = readShortcutsVdf(shortcutsFile)
      expect(result).not.toBeNull()
      expect(result).toHaveProperty('shortcuts')
    })
  })

  describe('getExe', () => {
    test('strips the quotes Steam puts around it', () => {
      expect(getExe({ Exe: '"/a/b c.bat"' })).toBe('/a/b c.bat')
      expect(getExe({ exe: '/a/b.bat' })).toBe('/a/b.bat')
      expect(getExe({})).toBe('')
    })
  })

  describe('findShortcutInAllUsers', () => {
    // shortcuts_valid.vdf: "Discord", appid -1632866652 (signed), Exe "/usr/share/discord/Discord"
    const DISCORD_ID = -1632866652 >>> 0

    test('finds a shortcut by its Steam id (unsigned, as rakun stores it)', () => {
      copyValidTestVdf()
      const result = findShortcutInAllUsers({ steamAppId: DISCORD_ID })
      expect(result.found).toBe(true)
      expect(result.entry).not.toBeNull()
    })

    test('finds a shortcut by what it runs', () => {
      copyValidTestVdf()
      const result = findShortcutInAllUsers({
        exe: '/usr/share/discord/Discord'
      })
      expect(result.found).toBe(true)
    })

    test('the title is not a way to find it', () => {
      copyValidTestVdf()
      const result = findShortcutInAllUsers({
        steamAppId: 1,
        exe: '/other.bat'
      })
      expect(result.found).toBe(false)
      expect(result.entry).toBeNull()
    })

    test('a missing query matches nothing', () => {
      copyValidTestVdf()
      expect(findShortcutInAllUsers({}).found).toBe(false)
    })

    test('returns error when no Steam userdata directories exist', () => {
      const emptyDir = dirSync()
      GlobalConfig.setConfigValue('defaultSteamPath', emptyDir.name)

      const result = findShortcutInAllUsers({ exe: '/a.bat' })
      expect(result.found).toBe(false)
      expect(result.entry).toBeNull()
      expect(result.error).toContain(emptyDir.name)

      emptyDir.removeCallback()
    })
  })
})
