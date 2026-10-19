import { TypeCheckedStoreBackend } from '../../typed_store'
import CacheStore from '../../cache'
import { GameInfo } from 'common/types'

const installedGamesStore = new TypeCheckedStoreBackend(
  'itchInstalledGamesStore',
  {
    cwd: 'itch_store',
    name: 'installed'
  }
)

const configStore = new TypeCheckedStoreBackend('itchConfigStore', {
  cwd: 'itch_store'
})

const libraryStore = new CacheStore<GameInfo[], 'games'>('itch_library', null)

export { configStore, installedGamesStore, libraryStore }
