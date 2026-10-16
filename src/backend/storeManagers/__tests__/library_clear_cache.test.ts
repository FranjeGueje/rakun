// Each library forgets its own stores, and only them: logging out of a store
// must not leave its library or install info behind
import * as gog from '../gog/electronStores'
import * as legendary from '../legendary/electronStores'
import * as nile from '../nile/electronStores'
import * as zoom from '../zoom/electronStores'
import * as itch from '../itch/electronStores'

jest.mock('backend/logger')
jest.mock('backend/utils', () => ({}))
jest.mock('backend/runner_call', () => ({ callRunner: jest.fn() }))
jest.mock('backend/config', () => ({ GlobalConfig: { get: jest.fn() } }))
jest.mock('backend/online_monitor', () => ({
  isOnline: jest.fn(),
  runOnceWhenOnline: jest.fn()
}))
jest.mock('backend/ipc', () => ({ sendFrontendMessage: jest.fn() }))
jest.mock('../index', () => ({ libraryManagerMap: {} }))
jest.mock('../gog/user', () => ({ GOGUser: {} }))
jest.mock('../legendary/user', () => ({ LegendaryUser: {} }))
jest.mock('../nile/user', () => ({ NileUser: {} }))
jest.mock('../zoom/user', () => ({ ZoomUser: {} }))
jest.mock('../itch/user', () => ({ ItchUser: {} }))
jest.mock('../gog/games', () => ({ default: class {} }))
jest.mock('../legendary/games', () => ({ default: class {} }))
jest.mock('../nile/games', () => ({ default: class {} }))
jest.mock('../zoom/games', () => ({ default: class {} }))
jest.mock('../itch/games', () => ({ default: class {} }))
jest.mock('../gog/electronStores', () => ({
  apiInfoCache: { clear: jest.fn() },
  installInfoStore: { clear: jest.fn() },
  installedGamesStore: { clear: jest.fn() },
  libraryStore: { clear: jest.fn() }
}))
jest.mock('../legendary/electronStores', () => ({
  installStore: { clear: jest.fn() },
  libraryStore: { clear: jest.fn() },
  gameInfoStore: { clear: jest.fn() }
}))
jest.mock('../nile/electronStores', () => ({
  installStore: { clear: jest.fn() },
  libraryStore: { clear: jest.fn() }
}))
jest.mock('../zoom/electronStores', () => ({
  installInfoStore: { clear: jest.fn() },
  installedGamesStore: { clear: jest.fn() },
  libraryStore: { clear: jest.fn() }
}))
jest.mock('../itch/electronStores', () => ({
  configStore: {},
  installedGamesStore: { clear: jest.fn() },
  libraryStore: { clear: jest.fn() }
}))

import GOGLibraryManager from '../gog/library'
import LegendaryLibraryManager from '../legendary/library'
import NileLibraryManager from '../nile/library'
import ZoomLibraryManager from '../zoom/library'
import ItchLibraryManager from '../itch/library'

describe('clearCache of a library', () => {
  test('Zoom: forgets its library and install info', () => {
    new ZoomLibraryManager().clearCache()

    expect(zoom.libraryStore.clear).toHaveBeenCalled()
    expect(zoom.installInfoStore.clear).toHaveBeenCalled()
    expect(zoom.installedGamesStore.clear).not.toHaveBeenCalled()
  })

  test('GOG: its library, install info and API cache', () => {
    new GOGLibraryManager().clearCache()

    expect(gog.libraryStore.clear).toHaveBeenCalled()
    expect(gog.installInfoStore.clear).toHaveBeenCalled()
    expect(gog.apiInfoCache.clear).toHaveBeenCalled()
    expect(gog.installedGamesStore.clear).not.toHaveBeenCalled()
  })

  test('Epic: its stores, and legendary is told to clean up', () => {
    const library = new LegendaryLibraryManager()
    const run = jest
      .spyOn(library, 'runRunnerCommand')
      .mockResolvedValue({ stdout: '', stderr: '' })

    library.clearCache()

    expect(legendary.libraryStore.clear).toHaveBeenCalled()
    expect(legendary.installStore.clear).toHaveBeenCalled()
    expect(legendary.gameInfoStore.clear).toHaveBeenCalled()
    expect(run).toHaveBeenCalledWith(
      { subcommand: 'cleanup' },
      expect.anything()
    )
  })

  test('Amazon: its library and install info', () => {
    new NileLibraryManager().clearCache()

    expect(nile.libraryStore.clear).toHaveBeenCalled()
    expect(nile.installStore.clear).toHaveBeenCalled()
  })

  test('itch.io: only the library, the installed list is the record of the disk', () => {
    new ItchLibraryManager().clearCache()

    expect(itch.libraryStore.clear).toHaveBeenCalled()
    expect(itch.installedGamesStore.clear).not.toHaveBeenCalled()
  })

  test('nothing leaks between stores', () => {
    new ZoomLibraryManager().clearCache()

    expect(gog.libraryStore.clear).not.toHaveBeenCalled()
    expect(legendary.libraryStore.clear).not.toHaveBeenCalled()
  })
})
