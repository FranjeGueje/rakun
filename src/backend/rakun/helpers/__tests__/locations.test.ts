import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const root = mkdtempSync(join(tmpdir(), 'rakun-locations-'))
const paths = {
  rakunBinPath: join(root, 'share', 'bin'),
  rakunMountPath: join(root, 'share', 'mount'),
  publicDir: join(root, 'app', 'public')
}
jest.mock('backend/constants/paths', () => paths)

const mockedWarning = jest.fn()
const mockedInfo = jest.fn()
jest.mock('backend/logger', () => ({
  logWarning: (...args: unknown[]) => mockedWarning(...args),
  logInfo: (...args: unknown[]) => mockedInfo(...args)
}))

import {
  checkHelpersAtStart,
  currentHelpers,
  helperExists,
  helperFile,
  missingHelpers
} from '../locations'
import { machineArch, recordTag } from '../files'
import {
  clearHelperOutputWarning,
  parseHelperJson
} from 'backend/storeManagers/helper_output'

afterAll(() => rmSync(root, { recursive: true, force: true }))

function put(path: string, content = 'x') {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

describe('helperFile', () => {
  test('is the downloaded file, or else the one in the tarball, or else where it would go', () => {
    const relative = join('x64', 'linux', 'legendary')
    const downloaded = join(paths.rakunBinPath, relative)
    const bundled = join(paths.publicDir, 'bin', relative)

    expect(helperFile(relative)).toBe(downloaded)
    expect(helperExists(relative)).toBe(false)

    put(bundled)
    expect(helperFile(relative)).toBe(bundled)
    expect(helperExists(relative)).toBe(true)

    put(downloaded)
    expect(helperFile(relative)).toBe(downloaded)
  })
})

describe('checkHelpersAtStart', () => {
  test('says what is missing and what to run', () => {
    expect(missingHelpers()).toContain('gogdl')

    checkHelpersAtStart()

    const [message] = mockedWarning.mock.calls.at(-1) as [string]
    expect(message).toMatch(/^Helper binaries missing: .*gogdl/)
    expect(message).toContain('Run: rakunctl helpers update')
  })
})

describe('a helper that is not the tested version', () => {
  const nile = () =>
    currentHelpers().find(({ helper }) => helper === 'nile') as {
      state: string
      warning?: string
    }

  beforeEach(() => {
    put(join(paths.rakunBinPath, machineArch(), 'linux', 'nile'))
    put(join(paths.rakunMountPath, 'bin', 'nile.exe'))
    recordTag(paths.rakunBinPath, 'nile', 'v0.0.1-other')
    mockedWarning.mockClear()
  })

  test('is said at the start: what it prints may not be what rakun reads', () => {
    expect(nile().state).toBe('other')

    checkHelpersAtStart()

    const said = mockedWarning.mock.calls.map(([message]) => String(message))
    expect(
      said.some((m) => /^nile is v0\.0\.1-other, not the tested /.test(m))
    ).toBe(true)
  })

  test('what it printed that rakun did not understand is shown next to its version', () => {
    expect(nile().warning).toBeUndefined()

    expect(() =>
      parseHelperJson(
        'nile',
        'list-updates --json',
        'oops',
        (v): v is string[] => Array.isArray(v)
      )
    ).toThrow()

    expect(nile().warning).toContain('nile list-updates --json')
    clearHelperOutputWarning('nile', 'list-updates --json')
    expect(nile().warning).toBeUndefined()
  })
})
