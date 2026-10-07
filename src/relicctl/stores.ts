import type { Runner } from 'common/types'
import { CliError } from './client'

type Store = { name: string; runner: Runner; label: string }

export const STORES: readonly Store[] = [
  {
    name: 'epic',
    runner: 'legendary',
    label: 'Epic'
  },
  { name: 'gog', runner: 'gog', label: 'GOG' },
  { name: 'amazon', runner: 'nile', label: 'Amazon' },
  { name: 'zoom', runner: 'zoom', label: 'Zoom' }
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
