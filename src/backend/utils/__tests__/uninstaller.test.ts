import { libraryManagerMap } from 'backend/storeManagers'
import { sendGameStatusUpdate } from 'backend/utils'
import { onGameUninstalled } from 'backend/rakun/game_events'
import { uninstallGameCallback } from '../uninstaller'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

jest.mock('backend/logger')
jest.mock('backend/utils', () => ({ sendGameStatusUpdate: jest.fn() }))
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: () => ({ getSettings: () => ({ defaultInstallPath: '/somewhere' }) })
  }
}))
jest.mock('backend/storeManagers', () => ({ libraryManagerMap: {} }))
jest.mock('backend/rakun/game_events', () => ({ onGameUninstalled: jest.fn() }))

const uninstall = jest.fn()
let installPath: string

beforeEach(() => {
  installPath = mkdtempSync(join(tmpdir(), 'rakun-uninstall-'))
  writeFileSync(join(installPath, 'game.bin'), 'x')
  uninstall.mockReset()
  ;(libraryManagerMap as Record<string, unknown>)['gog'] = {
    getGame: () => ({
      uninstall,
      getGameInfo: () => ({ install: { install_path: installPath } })
    })
  }
})

afterEach(() => rmSync(installPath, { recursive: true, force: true }))

describe('uninstallGameCallback', () => {
  test('removes the folder after a good uninstall', async () => {
    uninstall.mockResolvedValue({ stdout: '', stderr: '' })

    await uninstallGameCallback(null, 'g1', 'gog', true)

    expect(existsSync(installPath)).toBe(false)
  })

  test('keeps the folder when the uninstall answers an error', async () => {
    uninstall.mockResolvedValue({ stdout: '', stderr: '', error: 'boom' })

    await uninstallGameCallback(null, 'g1', 'gog', true)

    expect(existsSync(installPath)).toBe(true)
  })

  test('keeps the folder when the uninstall throws', async () => {
    uninstall.mockRejectedValue(new Error("Game isn't installed"))

    await uninstallGameCallback(null, 'g1', 'gog', true)

    expect(existsSync(installPath)).toBe(true)
  })

  test('keeps the folder when the prefix was not asked for', async () => {
    uninstall.mockResolvedValue({ stdout: '', stderr: '' })

    await uninstallGameCallback(null, 'g1', 'gog', false)

    expect(existsSync(installPath)).toBe(true)
  })

  test('tells Steam after a good uninstall, and only then', async () => {
    uninstall.mockResolvedValue({ stdout: '', stderr: '' })
    await uninstallGameCallback(null, 'g1', 'gog', false)
    expect(onGameUninstalled).toHaveBeenCalledTimes(1)

    jest.mocked(onGameUninstalled).mockClear()
    uninstall.mockResolvedValue({ stdout: '', stderr: '', error: 'boom' })
    await uninstallGameCallback(null, 'g1', 'gog', false)
    uninstall.mockResolvedValue({ stdout: '', stderr: '', abort: true })
    await uninstallGameCallback(null, 'g1', 'gog', false)
    expect(onGameUninstalled).not.toHaveBeenCalled()
  })

  test('a failure in Steam does not undo the uninstall', async () => {
    uninstall.mockResolvedValue({ stdout: '', stderr: '' })
    jest.mocked(onGameUninstalled).mockRejectedValue(new Error('no Steam'))

    await uninstallGameCallback(null, 'g1', 'gog', true)

    expect(existsSync(installPath)).toBe(false)
  })

  test('always ends with the done status', async () => {
    uninstall.mockResolvedValue({ stdout: '', stderr: '', error: 'boom' })

    await uninstallGameCallback(null, 'g1', 'gog', true)

    expect(sendGameStatusUpdate).toHaveBeenLastCalledWith({
      appName: 'g1',
      runner: 'gog',
      status: 'done'
    })
  })
})
