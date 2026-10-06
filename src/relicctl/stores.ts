import type { Runner } from 'common/types'
import { CliError } from './client'

type Store = { name: string; runner: Runner; label: string; logout: string }

export const STORES: readonly Store[] = [
  {
    name: 'epic',
    runner: 'legendary',
    label: 'Epic',
    logout: 'logoutLegendary'
  },
  { name: 'gog', runner: 'gog', label: 'GOG', logout: 'logoutGOG' },
  { name: 'amazon', runner: 'nile', label: 'Amazon', logout: 'logoutAmazon' },
  { name: 'zoom', runner: 'zoom', label: 'Zoom', logout: 'logoutZoom' }
]

/** Accepts the friendly name (`epic`) and the runner's (`legendary`) */
export function parseStore(name: string | undefined): Store {
  const store = STORES.find((s) => s.name === name || s.runner === name)
  if (!store) {
    const valid = STORES.map((s) => s.name).join(', ')
    throw new CliError(`Tienda desconocida "${name ?? ''}" (${valid})`)
  }
  return store
}

export function storeLabel(runner: Runner): string {
  return STORES.find((s) => s.runner === runner)?.label ?? runner
}
