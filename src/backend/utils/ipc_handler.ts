import { addHandler } from 'backend/ipc'

import {
  getGogdlVersion,
  getLegendaryVersion,
  getNileVersion
} from './helperBinaries'
import { getSystemInfo } from './systeminfo'

addHandler('getLegendaryVersion', getLegendaryVersion)
addHandler('getGogdlVersion', getGogdlVersion)
addHandler('getNileVersion', getNileVersion)
addHandler('getSystemInfo', async (e, cache) => getSystemInfo(cache))
