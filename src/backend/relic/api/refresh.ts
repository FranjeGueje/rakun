import type { Runner } from 'common/types'
import { sendFrontendMessage } from 'backend/ipc'
import { logError, LogPrefix } from 'backend/logger'
import { libraryManagerMap } from 'backend/storeManagers'

const RUNNERS = Object.keys(libraryManagerMap) as Runner[]

// A store refresh can take minutes (GOG asks for every game one by one) and two
// at once only make each other slower, so a second request joins the first
const inFlight = new Map<Runner, Promise<void>>()

/** Refreshes one store; a refresh already running for it is joined, not repeated */
export function refreshRunner(runner: Runner): Promise<void> {
  const running = inFlight.get(runner)
  if (running) return running

  const refresh = libraryManagerMap[runner]
    .refresh()
    .then(() => undefined)
    .catch((error: unknown) =>
      logError(
        [`Refreshing the ${runner} library failed:`, error],
        LogPrefix.Backend
      )
    )
    .finally(() => {
      inFlight.delete(runner)
      sendFrontendMessage('refreshLibrary', runner)
    })

  inFlight.set(runner, refresh)
  return refresh
}

/** Starts refreshing one store or all of them and returns right away */
export function startRefresh(library: Runner | 'all' = 'all'): void {
  const runners = library === 'all' ? RUNNERS : [library]
  runners.forEach((runner) => void refreshRunner(runner))
}

export function refreshingRunners(): Runner[] {
  return [...inFlight.keys()]
}
