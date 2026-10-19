import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// The real file system, on a folder of its own
const root = mkdtempSync(join(tmpdir(), 'rakun-gamelink-'))
jest.mock('backend/constants/paths', () => ({
  ...jest.requireActual('backend/constants/paths'),
  rakunGamesPath: `${require('os').tmpdir()}/rakun-gamelink-games`
}))
jest.mock('backend/logger')

import { createGameSymlink } from '../add_game'
import { rakunGamesPath } from 'backend/constants/paths'

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(rakunGamesPath, { recursive: true, force: true })
})
beforeEach(() => rmSync(rakunGamesPath, { recursive: true, force: true }))

describe('createGameSymlink', () => {
  test('links the game folder under the games folder', () => {
    const install = join(root, 'Game')
    mkdirSync(install)

    const result = createGameSymlink(install)

    expect(result).toEqual({ linkPath: join(rakunGamesPath, 'Game') })
    expect(readlinkSync(join(rakunGamesPath, 'Game'))).toBe(install)
  })

  test('replaces a link whose target was deleted by hand (reinstall)', () => {
    const gone = join(root, 'Gone', 'Game')
    mkdirSync(rakunGamesPath, { recursive: true })
    symlinkSync(gone, join(rakunGamesPath, 'Game'))
    expect(existsSync(join(rakunGamesPath, 'Game'))).toBe(false)
    const install = join(root, 'Game2', 'Game')
    mkdirSync(install, { recursive: true })

    const result = createGameSymlink(install)

    expect(result).toEqual({ linkPath: join(rakunGamesPath, 'Game') })
    expect(readlinkSync(join(rakunGamesPath, 'Game'))).toBe(install)
  })

  test('does not delete a real folder that is in the way', () => {
    mkdirSync(join(rakunGamesPath, 'Game'), { recursive: true })

    const result = createGameSymlink(join(root, 'Elsewhere', 'Game'))

    expect(result).toHaveProperty('error')
    expect(lstatSync(join(rakunGamesPath, 'Game')).isDirectory()).toBe(true)
  })
})
