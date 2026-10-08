import { existsSync } from 'fs'
import { searchForExecutableOnPath } from './os/path'
import { join } from 'path'
import { helperFile } from 'backend/rakun/helpers/locations'

export const getUmuPath = async (): Promise<string | null> => {
  const path = await searchForExecutableOnPath('umu-run')
  if (path) return path

  const bundled = helperFile(join('umu', 'umu-run'))
  if (existsSync(bundled)) return bundled

  return null
}
