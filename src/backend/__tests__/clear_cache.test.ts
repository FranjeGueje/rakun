import { clearCache } from '../utils'
import { libraryManagerMap } from '../storeManagers'

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
jest.mock('../storeManagers', () => ({
  libraryManagerMap: {
    legendary: { clearCache: jest.fn() },
    gog: { clearCache: jest.fn() },
    zoom: { clearCache: jest.fn() },
    // A store with nothing to forget has no clearCache at all
    nile: {}
  },
  RUNNERS: ['legendary', 'gog', 'zoom', 'nile']
}))

const cleared = (runner: 'legendary' | 'gog' | 'zoom') =>
  libraryManagerMap[runner].clearCache as jest.Mock

describe('clearCache', () => {
  test('only the store asked for', () => {
    clearCache('zoom')

    expect(cleared('zoom')).toHaveBeenCalledTimes(1)
    expect(cleared('gog')).not.toHaveBeenCalled()
    expect(cleared('legendary')).not.toHaveBeenCalled()
  })

  test('with no store, all of them', () => {
    clearCache()

    for (const runner of ['legendary', 'gog', 'zoom'] as const) {
      expect(cleared(runner)).toHaveBeenCalledTimes(1)
    }
  })

  test('a store with nothing to forget is skipped, not an error', () => {
    expect(() => clearCache('nile')).not.toThrow()
  })
})
