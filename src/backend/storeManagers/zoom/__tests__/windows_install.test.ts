import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { installModeOr, installZoomInteractively } from '../windows_install'

const mockLaunchUmu = jest.fn()
const mockDisplay = jest.fn()
const mockProton = jest.fn()
const mockSearch = jest.fn()

jest.mock('backend/rakun/umu', () => ({
  launchUmu: (...args: unknown[]) => mockLaunchUmu(...args),
  searchUmuGameId: (...args: unknown[]) => mockSearch(...args)
}))
jest.mock('../display', () => ({ displayForInstaller: () => mockDisplay() }))
jest.mock('backend/config', () => ({
  GlobalConfig: { get: () => ({ getProtonPath: () => mockProton() }) }
}))
jest.mock('backend/constants/paths', () => ({ rakunMountPath: '/mock/mount' }))
jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  LogPrefix: { Zoom: 'Zoom' }
}))

describe('installModeOr', () => {
  test('no mode is the Steam one: it needs no screen', () => {
    expect(installModeOr(undefined)).toBe('steam')
    expect(installModeOr('interactive')).toBe('interactive')
    expect(installModeOr('steam')).toBe('steam')
  })
})

describe('installZoomInteractively', () => {
  let installPath: string

  beforeEach(() => {
    jest.clearAllMocks()
    installPath = mkdtempSync(join(tmpdir(), 'zoom-interactive-'))
    mockDisplay.mockReturnValue({ ok: true })
    mockProton.mockReturnValue('/proton')
    mockLaunchUmu.mockResolvedValue({ success: false })
    mockSearch.mockResolvedValue('umu-123')
  })

  afterEach(() => rmSync(installPath, { recursive: true, force: true }))

  test('does not start without a screen or without Proton, and says why', async () => {
    mockDisplay.mockReturnValue({ ok: false, reason: 'rakun has no screen' })
    expect(
      (await installZoomInteractively('g', installPath, 's.exe')).error
    ).toContain('rakun has no screen')
    mockDisplay.mockReturnValue({ ok: true })
    mockProton.mockReturnValue('')
    expect(
      (await installZoomInteractively('g', installPath, 's.exe')).error
    ).toContain('No GE-Proton configured')
    expect(mockLaunchUmu).not.toHaveBeenCalled()
  })

  test('runs the install-only .bat of the runner in the game folder and removes it after', async () => {
    let bat = ''
    mockLaunchUmu.mockImplementation(() => {
      bat = readFileSync(
        join(installPath, 'drive_c', 'rakun_install.bat'),
        'utf-8'
      )
      writeFileSync(
        join(installPath, 'drive_c', 'rakun_exe.txt'),
        'C:\\game.exe'
      )
      return Promise.resolve({ success: false })
    })

    const result = await installZoomInteractively('g', installPath, 'setup.exe')

    expect(result).toEqual({})
    expect(mockLaunchUmu).toHaveBeenCalledWith({
      winePrefix: installPath,
      gameId: 'umu-123',
      protonPath: '/proton',
      store: 'zoom',
      executable: 'cmd',
      args: ['/c', 'C:\\rakun_install.bat']
    })
    expect(bat).toContain('set "STORE=zoom"')
    expect(bat).toContain('set "INSTALLER=setup.exe"')
    expect(bat).toContain('set "INSTALL_ONLY=1"')
    expect(existsSync(join(installPath, 'drive_c', 'rakun_install.bat'))).toBe(
      false
    )
  })

  test('no executable left by the runner means the installer did not finish', async () => {
    mkdirSync(join(installPath, 'drive_c', 'zoom_installer'), {
      recursive: true
    })

    const result = await installZoomInteractively('g', installPath, 'setup.exe')

    expect(result.error).toContain('did not finish')
    expect(existsSync(join(installPath, 'drive_c', 'zoom_installer'))).toBe(
      true
    )
  })
})
