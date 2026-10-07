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
import type { DMQueueElement, InstallParams } from 'common/types'

/** Installing over an installed game would download it all again and nothing else */
function refuseIfInstalled({ appName, runner }: InstallParams) {
  // The same reading as `getLibrary`: it comes from the files, so it is right
  // right after relicd starts, before any refresh has filled the in-memory maps
  const installed = stores[runner]
    .readLibrary()
    .some((game) => game.app_name === appName && game.is_installed)
  if (installed) throw new Error('already installed: use repair or update')
}

addHandler('install', async (_e, args) => {
  refuseIfInstalled(args)
  const dmQueueElement: DMQueueElement = {
    params: args,
    type: 'install',
    addToQueueTime: Date.now(),
    endTime: 0,
    startTime: 0
  }

  await addToQueue(dmQueueElement)

  // Add Dlcs to the queue
  if (
    Array.isArray(args.installDlcs) &&
    args.installDlcs.length > 0 &&
    args.runner === 'legendary'
  ) {
    for (const dlc of args.installDlcs) {
      const dlcQueueElement: DMQueueElement = {
        params: {
          ...args,
          appName: dlc
        },
        type: 'install',
        addToQueueTime: Date.now(),
        endTime: 0,
        startTime: 0
      }
      await addToQueue(dlcQueueElement)
    }
  }
})

addHandler('updateGame', async (_e, args) => {
  const {
    gameInfo: {
      install: { platform, install_path }
    }
  } = args

  const dmQueueElement: DMQueueElement = {
    params: { ...args, path: install_path!, platformToInstall: platform! },
    type: 'update',
    addToQueueTime: Date.now(),
    endTime: 0,
    startTime: 0
  }

  await addToQueue(dmQueueElement)
})

addListener('removeFromDMQueue', (e, appName) => removeFromQueue(appName))
addListener('clearFinishedDMQueue', () => clearFinished())
addListener('resumeCurrentDownload', () => resumeCurrentDownload())
addListener('pauseCurrentDownload', () => pauseCurrentDownload())
addListener('cancelDownload', (e, removeDownloaded) =>
  cancelCurrentDownload({ removeDownloaded })
)
addHandler('getDMQueueInformation', getQueueInformation)
