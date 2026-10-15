import { mkdirSync } from 'fs'
import { resolve } from 'path'
import type { Butlerd } from './butlerd'

type Location = { id: string; path: string }

/** butler installs inside a "location" it knows: the one for this folder, made when there is none */
export async function installLocationFor(
  butlerd: Butlerd,
  folder: string
): Promise<string> {
  const path = resolve(folder)
  // butler only registers a folder that is already there
  mkdirSync(path, { recursive: true })
  const { installLocations } = await butlerd.call<{
    installLocations: Location[]
  }>('Install.Locations.List')
  const known = (installLocations ?? []).find(
    (location) => location.path === path
  )
  if (known) return known.id

  const { installLocation } = await butlerd.call<{ installLocation: Location }>(
    'Install.Locations.Add',
    { path }
  )
  return installLocation.id
}
