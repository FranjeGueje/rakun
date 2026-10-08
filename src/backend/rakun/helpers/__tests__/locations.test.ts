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
  helperExists,
  helperFile,
  missingHelpers
} from '../locations'

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
