import { libraryManagerMap } from 'backend/storeManagers'
import { TypeCheckedStoreBackend } from './../typed_store'
import { logError, logInfo, LogPrefix, logWarning } from 'backend/logger'
import { getFileSize, removeFolder, sendGameStatusUpdate } from '../utils'
import {
  DMQueueElement,
  DMStatus,
  DownloadManagerState,
  Runner
} from 'common/types'
import { installQueueElement, updateQueueElement } from './utils'
import { sendFrontendMessage } from '../ipc'
import { callAbortController } from 'backend/utils/aborthandler/aborthandler'
import { onConnectivityChange } from 'backend/online_monitor'

const downloadManager = new TypeCheckedStoreBackend('downloadManager', {
  name: 'download-manager'
})

/*
#### Private ####
*/

let queueState: DownloadManagerState = 'idle'
let currentElement: DMQueueElement | null = null
let autoPaused = false
// The loops run one after the other: a resume right after a pause waits for the
// loop of the paused download to see its abort
let loop: Promise<void> = Promise.resolve()
let generation = 0
// A pause stopped the current download, so its «abort» means «paused», not «cancelled»
let pauseRequested = false

onConnectivityChange((status) => {
  if (status === 'offline' && isRunning()) {
    logInfo('System offline, auto-pausing downloads', LogPrefix.DownloadManager)
    pauseCurrentDownload()
    autoPaused = true
  } else if (status === 'online' && autoPaused) {
    logInfo('System online, auto-resuming downloads', LogPrefix.DownloadManager)
    autoPaused = false
    void resumeCurrentDownload()
  }
})

function getFirstQueueElement() {
  const elements = downloadManager.get('queue', [])
  return elements.at(0) ?? null
}

function isPaused(): boolean {
  return queueState === 'paused'
}

function isIdle(): boolean {
  return queueState === 'idle' || !currentElement
}

function isRunning(): boolean {
  return queueState === 'running'
}

function addToFinished(element: DMQueueElement, status: DMStatus) {
  const elements = downloadManager.get('finished', [])

  const elementIndex = elements.findIndex(
    (el) =>
      el.params.appName === element.params.appName &&
      el.params.runner === element.params.runner
  )

  if (elementIndex >= 0) {
    elements[elementIndex] = { ...element, status: status ?? 'abort' }
  } else {
    elements.push({ ...element, status })
  }

  downloadManager.set('finished', elements)
  logInfo(
    [element.params.appName, 'added to download manager finished.'],
    LogPrefix.DownloadManager
  )
}

/*
#### Public ####
*/

function initQueue(): Promise<void> {
  // The queue also starts 5 s after the frontend is ready, so a game queued
  // within that window must not get a second loop processing the same element
  if (isRunning()) return loop

  queueState = 'running'
  const token = ++generation
  loop = loop.then(() => runQueue(token))
  return loop
}

async function runQueue(token: number) {
  let element = getFirstQueueElement()

  while (element) {
    pauseRequested = false
    const queuedElements = downloadManager.get('queue', [])
    element.startTime = Date.now()
    queuedElements[0] = element
    downloadManager.set('queue', queuedElements)

    currentElement = element

    sendFrontendMessage('changedDMQueueInformation', queuedElements, queueState)

    const { status, error } =
      element.type === 'install'
        ? await installQueueElement(element.params)
        : await updateQueueElement(element.params)
    element.endTime = Date.now()
    element.error = error

    // Only an aborted download is a paused one; a pause that arrived as the
    // download finished leaves it done
    const paused = status === 'abort' && pauseRequested
    pauseRequested = false
    logQueueOutcome(element, status, paused)

    if (paused) {
      element = null
    } else {
      currentElement = null
      addToFinished(element, status)
      removeFromQueue(element.params.appName, element.params.runner)
      element = isPaused() ? null : getFirstQueueElement()
    }
  }

  // A later loop (a resume) owns the state now
  if (token === generation && queueState === 'running') {
    currentElement = null
    queueState = 'idle'
  }
}

async function addToQueue(element: DMQueueElement) {
  if (!element) {
    logError(
      'Can not add undefined element to queue!',
      LogPrefix.DownloadManager
    )
    return
  }

  sendGameStatusUpdate({
    appName: element.params.appName,
    runner: element.params.runner,
    folder: element.params.path,
    status: 'queued'
  })

  const elements = downloadManager.get('queue', [])

  const elementIndex = elements.findIndex(
    (el) =>
      el.params.appName === element.params.appName &&
      el.params.runner === element.params.runner
  )

  if (elementIndex >= 0) {
    elements[elementIndex] = element
  } else {
    const installInfo = await libraryManagerMap[
      element.params.runner
    ].getInstallInfo(element.params.appName, element.params.platformToInstall, {
      branch: element.params.branch,
      build: element.params.build
    })

    element.params.size = installInfo?.manifest?.download_size
      ? getFileSize(installInfo?.manifest?.download_size)
      : '?? MB'
    elements.push(element)
  }

  downloadManager.set('queue', elements)
  logInfo(
    [element.params.gameInfo.title, ' was added to the download queue.'],
    LogPrefix.DownloadManager
  )

  sendFrontendMessage('changedDMQueueInformation', elements, queueState)

  if (isIdle()) {
    void initQueue()
  }
}

/** Ids of two stores can be the same: with the runner it is the one of that store, without it the first with that id */
function removeFromQueue(appName: string, runner?: Runner) {
  if (appName && downloadManager.has('queue')) {
    const elements = downloadManager.get('queue', [])
    const index = elements.findIndex(
      (queueElement) =>
        queueElement?.params.appName === appName &&
        (!runner || queueElement.params.runner === runner)
    )
    if (index !== -1) {
      elements.splice(index, 1)
      downloadManager.delete('queue')
      downloadManager.set('queue', elements)
    }

    sendGameStatusUpdate({
      appName,
      status: 'done'
    })

    logInfo(
      [appName, 'removed from download manager.'],
      LogPrefix.DownloadManager
    )

    sendFrontendMessage('changedDMQueueInformation', elements, queueState)
  }
}

function getQueueInformation() {
  const elements = downloadManager.get('queue', [])
  const finished = downloadManager.get('finished', [])

  return { elements, finished, state: queueState }
}

function cancelCurrentDownload({ removeDownloaded = false }) {
  if (currentElement) {
    if (Array.isArray(currentElement.params.installDlcs)) {
      const dlcsToRemove = currentElement.params.installDlcs
      for (const dlc of dlcsToRemove) {
        removeFromQueue(dlc, currentElement.params.runner)
      }
    }
    if (isRunning()) {
      stopCurrentDownload()
    }
    removeFromQueue(currentElement.params.appName, currentElement.params.runner)

    if (removeDownloaded) {
      const { appName, runner } = currentElement.params
      const { folder_name } = libraryManagerMap[runner]
        .getGame(appName)
        .getGameInfo()
      if (folder_name) {
        removeFolder(currentElement.params.path, folder_name)
      }
    }
    currentElement = null
  }
}

function clearFinished() {
  downloadManager.set('finished', [])
  sendFrontendMessage(
    'changedDMQueueInformation',
    downloadManager.get('queue', []),
    queueState
  )
}

function pauseCurrentDownload() {
  if (currentElement && isRunning()) {
    pauseRequested = true
    stopCurrentDownload()
  }
  queueState = 'paused'
  autoPaused = false
  sendFrontendMessage(
    'changedDMQueueInformation',
    downloadManager.get('queue', []),
    queueState
  )
}

function resumeCurrentDownload() {
  autoPaused = false
  void initQueue()
}

function stopCurrentDownload() {
  const { appName, runner } = currentElement!.params
  callAbortController(appName)
  void libraryManagerMap[runner].getGame(appName).stop()
}

// log the outcome of a queue element, based on its status and the queue's
function logQueueOutcome(
  element: DMQueueElement,
  status: DMStatus,
  paused: boolean
) {
  const action = element.type === 'install' ? 'Installation' : 'Update'
  if (status === 'abort') {
    if (paused) {
      logWarning(
        [action, 'of', element.params.appName, 'paused!'],
        LogPrefix.DownloadManager
      )
    } else {
      logWarning(
        [action, 'of', element.params.appName, 'aborted!'],
        LogPrefix.DownloadManager
      )
    }
  } else if (status === 'error') {
    logWarning(
      [action, 'of', element.params.appName, 'failed!'],
      LogPrefix.DownloadManager
    )
  } else if (status === 'done') {
    logInfo(
      ['Finished', action, 'of', element.params.appName],
      LogPrefix.DownloadManager
    )
  }
}

export {
  initQueue,
  addToQueue,
  removeFromQueue,
  getQueueInformation,
  cancelCurrentDownload,
  clearFinished,
  pauseCurrentDownload,
  resumeCurrentDownload,
  isRunning
}
