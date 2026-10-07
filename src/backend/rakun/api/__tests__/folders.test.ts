import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { exposedChannels } from '../../server/allowlist'

jest.mock('backend/ipc', () => ({ addHandler: jest.fn() }))

import { listFolders } from '../folders'

const base = mkdtempSync(join(tmpdir(), 'folders-'))
mkdirSync(join(base, 'beta'))
mkdirSync(join(base, 'Alpha'))
mkdirSync(join(base, '.hidden'))
writeFileSync(join(base, 'a-file.txt'), '')
afterAll(() => rmSync(base, { recursive: true, force: true }))

describe('listFolders', () => {
  test('lists only the folders, hidden ones too, sorted, with the parent', () => {
    expect(listFolders(base)).toEqual({
      path: base,
      parent: tmpdir(),
      folders: ['.hidden', 'Alpha', 'beta']
    })
  })

  test('the root of the disk has no parent', () => {
    expect(listFolders('/').parent).toBeNull()
  })

  test('a relative path or one that is not there throws a readable error', () => {
    expect(() => listFolders('relative/path')).toThrow('must be absolute')
    expect(() => listFolders(join(base, 'nope'))).toThrow()
  })

  test('without a path it starts at the home folder', () => {
    expect(listFolders().path).toBe(process.env.HOME)
  })

  test('is a channel the clients may call', () => {
    expect(exposedChannels.has('listFolders')).toBe(true)
  })
})
