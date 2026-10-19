import { addHandler, addListener } from '../ipc'
import {
  addToQueue,
  cancelCurrentDownload,
  clearFinished,
  getQueueInformation,
  pauseCurrentDownload,
  removeFromQueue,
  resumeCurrentDownload
} from './downloadqueue'

import { stores } from 'backend/storeManagers'
import { libraryOf } from 'backend/storeManagers/library_of'
import { INSTALL_MODES } from 'common/types'
import type { InstallParams } from 'common/types'
import { queueElement, updateElement } from './queue_element'

/** Installing over an installed game would download it all again and nothing else */
function refuseIfInstalled({ appName, runner }: InstallParams) {
  // The same reading as `getLibrary`: it comes from the files, so it is right
  // right after rakun starts, before any refresh has filled the in-memory maps
  const installed = stores[runner]
    .readLibrary()
    .some((game) => game.app_name === appName && game.is_installed)
  if (installed) throw new Error('already installed: use repair or update')
}

/** `installMode` is one of the two there are, or not there */
function refuseUnknownInstallMode({ installMode }: InstallParams) {
  if (installMode && !INSTALL_MODES.includes(installMode))
    throw new Error(
      `unknown install mode "${String(installMode)}": use ${INSTALL_MODES.join(' or ')}`
    )
}

addHandler('install', async (_e, args) => {
  refuseIfInstalled(args)
  refuseUnknownInstallMode(args)
  await addToQueue(queueElement('install', args))

  // Add Dlcs to the queue
  if (
    Array.isArray(args.installDlcs) &&
    args.installDlcs.length > 0 &&
    libraryOf(args.runner).queuesDlcs
  ) {
    for (const dlc of args.installDlcs) {
      await addToQueue(queueElement('install', { ...args, appName: dlc }))
    }
  }
})

addHandler('updateGame', async (_e, args) => {
  await addToQueue(updateElement(args))
})

addListener('removeFromDMQueue', (e, appName, runner) =>
  removeFromQueue(appName, runner)
)
addListener('clearFinishedDMQueue', () => clearFinished())
addListener('resumeCurrentDownload', () => resumeCurrentDownload())
addListener('pauseCurrentDownload', () => pauseCurrentDownload())
addListener('cancelDownload', (e, removeDownloaded) =>
  cancelCurrentDownload({ removeDownloaded })
)
addHandler('getDMQueueInformation', getQueueInformation)
