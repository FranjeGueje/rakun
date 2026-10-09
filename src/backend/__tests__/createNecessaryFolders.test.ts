jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  mkdirSync: jest.fn()
}))

jest.mock('../logger')
jest.mock('../dialog/dialog')

jest.mock('../storeManagers/gog/constants', () => ({
  gogdlAuthConfig: '/config/rakun/gog_store/auth.json'
}))

jest.mock('../storeManagers/zoom/constants', () => ({
  tokenPath: '/config/rakun/zoom_store/.zoom.token'
}))

import { existsSync, mkdirSync } from 'fs'
import { createNecessaryFolders } from '../utils'

const mockedExistsSync = jest.mocked(existsSync)
const mockedMkdirSync = jest.mocked(mkdirSync)

beforeEach(() => {
  jest.clearAllMocks()
  mockedExistsSync.mockReturnValue(false)
})

describe('createNecessaryFolders', () => {
  // Regression guard: gogdl writes auth.json with a plain open(path, 'w') and
  // never creates the directory. Without this folder, logging into GOG on a
  // fresh config crashes gogdl, which leaves Rakun with empty stdout and the
  // useless "Unexpected end of JSON input".
  test("creates gogdl's auth folder, without which GOG login fails on a fresh config", () => {
    createNecessaryFolders()

    expect(mockedMkdirSync).toHaveBeenCalledWith('/config/rakun/gog_store', {
      recursive: true
    })
  })

  // Regression guard: ZoomUser.login() saves the token with a bare
  // writeFileSync and never creates the folder. Its configStore would, but
  // every write to it happens after that line, so login dies with ENOENT on a
  // fresh config.
  test("creates Zoom's token folder, without which Zoom login fails on a fresh config", () => {
    createNecessaryFolders()

    expect(mockedMkdirSync).toHaveBeenCalledWith('/config/rakun/zoom_store', {
      recursive: true
    })
  })

  test('leaves existing folders alone', () => {
    mockedExistsSync.mockReturnValue(true)

    createNecessaryFolders()

    expect(mockedMkdirSync).not.toHaveBeenCalled()
  })
})
