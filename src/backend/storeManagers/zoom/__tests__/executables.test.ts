import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pickWindowsExecutable } from '../executables'

jest.mock('backend/logger')

function gameFolder(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'zoom-exe-'))
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true })
    writeFileSync(join(dir, name), content)
  }
  return dir
}

describe('pickWindowsExecutable', () => {
  test('the only game executable, ignoring installers and redistributables', async () => {
    const dir = gameFolder({
      'bin/Game.exe': 'x',
      'unins000.exe': 'x',
      'redist/vc.exe': 'x'
    })
    expect(await pickWindowsExecutable(dir, 'Some Game')).toBe('bin/Game.exe')
  })

  test('among several, the one named like the game', async () => {
    const dir = gameFolder({ 'tool.exe': 'xxxxxx', 'my-game.exe': 'x' })
    expect(await pickWindowsExecutable(dir, 'My Game')).toBe('my-game.exe')
  })

  test('among several unrelated ones, the biggest', async () => {
    const dir = gameFolder({ 'a.exe': 'x', 'b.exe': 'xxxx', 'c.exe': 'xx' })
    expect(await pickWindowsExecutable(dir, 'Zzz')).toBe('b.exe')
  })

  test('none found is an empty string', async () => {
    expect(await pickWindowsExecutable(gameFolder({ 'a.txt': 'x' }), 'G')).toBe(
      ''
    )
  })
})
