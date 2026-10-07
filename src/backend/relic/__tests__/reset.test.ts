import { mkdirSync, mkdtempSync, existsSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { removeAllBut } from '../reset'

jest.mock('backend/constants/paths', () => ({
  appFolder: '/nonexistent',
  relicGamesPath: '/nonexistent/games'
}))

describe('removeAllBut', () => {
  test('keeps only the given entry', () => {
    const dir = mkdtempSync(join(tmpdir(), 'relicd-reset-'))
    writeFileSync(join(dir, 'api.json'), '{}')
    writeFileSync(join(dir, 'config.json'), '{}')
    mkdirSync(join(dir, 'store'))
    writeFileSync(join(dir, 'store', 'queue.json'), '{}')

    removeAllBut(dir, join(dir, 'api.json'))

    expect(existsSync(join(dir, 'api.json'))).toBe(true)
    expect(existsSync(join(dir, 'config.json'))).toBe(false)
    expect(existsSync(join(dir, 'store'))).toBe(false)
  })
})
