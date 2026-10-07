import { addHandler } from 'backend/ipc'
import { RUNNERS, stores } from 'backend/storeManagers'

/** The games of one store (or all of them) as last refreshed, with install state */
addHandler('getLibrary', (_e, library = 'all') => {
  const runners = library === 'all' ? RUNNERS : [library]
  return runners.flatMap((runner) => stores[runner].readLibrary())
})
