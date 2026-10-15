import { machineArch } from 'backend/rakun/helpers/files'
import { helperFile } from 'backend/rakun/helpers/locations'
import { Butlerd } from './butlerd'
import { butlerDbPath } from './constants'

let running: Promise<Butlerd> | undefined

/** The butler of this machine, as downloaded by `rakunctl helpers update` */
const butlerBinary = () => helperFile(`${machineArch()}/linux/butler/butler`)

/** The daemon, started the first time it is needed (a failed start is tried again) */
export function getButlerd(): Promise<Butlerd> {
  running ??= Butlerd.start(butlerBinary(), butlerDbPath)
    .then((client) => {
      client.onClose(() => (running = undefined))
      return client
    })
    .catch((error) => {
      running = undefined
      throw error
    })
  return running
}
