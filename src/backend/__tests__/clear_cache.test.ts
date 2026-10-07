import { clearCache } from '../utils'
import * as gog from '../storeManagers/gog/electronStores'
import * as legendary from '../storeManagers/legendary/electronStores'
import * as nile from '../storeManagers/nile/electronStores'
import * as zoom from '../storeManagers/zoom/electronStores'

jest.mock('../logger')
jest.mock('../dialog/dialog')
// Nothing here may touch the real cache folder
jest.mock('backend/constants/paths', () => {
  const { mkdtempSync } = jest.requireActual<typeof import('fs')>('fs')
  const { tmpdir } = jest.requireActual<typeof import('os')>('os')
  const root = mkdtempSync(`${tmpdir()}/rakun-clearcache-`)
  return {
    ...jest.requireActual('backend/constants/paths'),
    storeCachePath: `${root}/store_cache`,
    appFolder: `${root}/rakun`,
    userDataPath: `${root}/rakun`
  }
})
jest.mock('../storeManagers/gog/electronStores', () => ({
  apiInfoCache: { clear: jest.fn() },
  installInfoStore: { clear: jest.fn() },
  libraryStore: { clear: jest.fn() }
}))
jest.mock('../storeManagers/legendary/electronStores', () => ({
  installStore: { clear: jest.fn() },
  libraryStore: { clear: jest.fn() },
  gameInfoStore: { clear: jest.fn() }
}))
jest.mock('../storeManagers/nile/electronStores', () => ({
  installStore: { clear: jest.fn() },
  libraryStore: { clear: jest.fn() }
}))
jest.mock('../storeManagers/zoom/electronStores', () => ({
  installInfoStore: { clear: jest.fn() },
  libraryStore: { clear: jest.fn() }
}))
jest.mock('../storeManagers', () => ({
  libraryManagerMap: { legendary: { runRunnerCommand: jest.fn() } }
}))

describe('clearCache', () => {
  test('Zoom: forgets its library and install info, which logging out must not leave behind', () => {
    clearCache('zoom')

    expect(zoom.libraryStore.clear).toHaveBeenCalled()
    expect(zoom.installInfoStore.clear).toHaveBeenCalled()
  })

  test('only the store asked for', () => {
    clearCache('zoom')

    expect(gog.libraryStore.clear).not.toHaveBeenCalled()
    expect(legendary.libraryStore.clear).not.toHaveBeenCalled()
    expect(nile.libraryStore.clear).not.toHaveBeenCalled()
  })

  test.each([
    ['gog', gog.libraryStore],
    ['legendary', legendary.libraryStore],
    ['nile', nile.libraryStore]
  ] as const)(
    '%s: still clears its library, and leaves Zoom alone',
    (runner, store) => {
      clearCache(runner)

      expect(store.clear).toHaveBeenCalled()
      expect(zoom.libraryStore.clear).not.toHaveBeenCalled()
    }
  )

  test('with no store, all of them', () => {
    clearCache()

    for (const store of [gog, legendary, nile, zoom]) {
      expect(store.libraryStore.clear).toHaveBeenCalled()
    }
  })
})
