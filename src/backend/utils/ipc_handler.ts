import { addListener, addHandler } from 'backend/ipc'

import { callAbortController } from './aborthandler/aborthandler'
import {
  getCometVersion,
  getGogdlVersion,
  getLegendaryVersion,
  getNileVersion
} from './helperBinaries'
import { hasExecutable } from './os/path'
import { getSystemInfo } from './systeminfo'
addListener('abort', (event, id) => {
  callAbortController(id)
})
addHandler('getLegendaryVersion', getLegendaryVersion)
addHandler('getGogdlVersion', getGogdlVersion)
addHandler('getCometVersion', getCometVersion)
addHandler('getNileVersion', getNileVersion)
addHandler('getSystemInfo', async (e, cache) => getSystemInfo(cache))
addHandler('hasExecutable', async (event, executable) => {
  return hasExecutable(executable)
})
