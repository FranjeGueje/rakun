import { rmSync } from 'fs'
import { relative, resolve, isAbsolute } from 'path'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import {
  createAbortController,
  deleteAbortController
} from '../../utils/aborthandler/aborthandler'
import type { Butlerd } from './butlerd'

/** What `Install.Queue` answers: the operation to perform and where it will leave the game */
export type Queued = {
  id: string
  caveId: string
  installFolder: string
  stagingFolder: string
}

/**
 * The operation was cancelled or paused (`callAbortController`, as for the other stores).
 * `queued` is what butler had made for it, if it had got that far.
 */
export class OperationAborted extends Error {
  constructor(readonly queued?: Queued) {
    super('The operation was aborted')
  }
}

const isInside = (folder: string, parent: string) => {
  const from = relative(resolve(parent), resolve(folder))
  return from !== '' && !from.startsWith('..') && !isAbsolute(from)
}

/**
 * butler forgets the install it was making when it is cancelled, and leaves what it had
 * written, so the next try makes another folder. The two it made for this try go, but only
 * if they are inside the place the game was being installed in (never the install of a game).
 */
export function discardPartialInstall(
  queued: Queued | undefined,
  place: string
) {
  if (!queued) return
  for (const folder of [queued.installFolder, queued.stagingFolder]) {
    if (!isInside(folder, place)) continue
    logInfo(
      `Removing what was left of a cancelled install: ${folder}`,
      LogPrefix.Itch
    )
    rmSync(folder, { recursive: true, force: true })
  }
}

// Butler's `Progress` carries no id of the operation: two at once would mix their percentages
let turn: Promise<unknown> = Promise.resolve()

/** Runs `work` after the ones that came before it, whatever they ended in */
export function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const result = turn.then(work, work)
  turn = result.catch(() => undefined)
  return result
}

/** Asks butler to stop an operation; whether it did is not the caller's business */
function cancelOperation(butlerd: Butlerd, id: string) {
  butlerd
    .call('Install.Cancel', { id })
    .catch((error: unknown) =>
      logError(['Install.Cancel failed:', error], LogPrefix.Itch)
    )
}

/**
 * Queues an operation and performs it. Aborting the controller of `appName` (what the
 * download manager does to pause or cancel, as for GOG, Legendary and Nile) cancels
 * it in butler, which keeps what it downloaded and takes it up again on the next try.
 */
export async function runOperation(
  butlerd: Butlerd,
  signal: AbortSignal,
  request: object,
  onProgress: (params: unknown) => void
): Promise<Queued> {
  const stopListening = butlerd.on('Progress', onProgress)
  let queued: Queued | undefined
  const onAbort = () => queued && cancelOperation(butlerd, queued.id)
  signal.addEventListener('abort', onAbort)
  try {
    if (signal.aborted) throw new OperationAborted()
    queued = await butlerd.call<Queued>('Install.Queue', request)
    // Aborted while it was being queued: there was no id to cancel yet
    if (signal.aborted) throw new OperationAborted(queued)
    await butlerd.call('Install.Perform', {
      id: queued.id,
      stagingFolder: queued.stagingFolder
    })
    return queued
  } catch (error) {
    throw signal.aborted ? new OperationAborted(queued) : error
  } finally {
    stopListening()
    signal.removeEventListener('abort', onAbort)
  }
}

/** The controller that pauses or cancels the operations on a game, and the way to drop it */
export function abortControllerOf(appName: string) {
  const controller = createAbortController(appName)
  return {
    signal: controller.signal,
    drop: () => deleteAbortController(appName)
  }
}
