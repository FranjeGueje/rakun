import type { Runner } from 'common/types'
import type { StoreInfo } from 'common/rakun/stores'
import { CliError } from './client'

/** Accepts the friendly name (`epic`) and the runner's (`legendary`) */
export function parseStore(
  stores: StoreInfo[],
  name: string | undefined
): StoreInfo {
  const store = stores.find((s) => s.name === name || s.id === name)
  if (!store) {
    const valid = stores.map((s) => s.name).join(', ')
    throw new CliError(`Unknown store "${name ?? ''}" (${valid})`)
  }
  return store
}

export function storeLabel(stores: StoreInfo[], runner: Runner): string {
  return stores.find((s) => s.id === runner)?.label ?? runner
}
