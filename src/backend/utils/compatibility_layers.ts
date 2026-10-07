import { existsSync } from 'fs'
import { searchForExecutableOnPath } from './os/path'
import { publicDir } from 'backend/constants/paths'
import { join } from 'path'

export const getUmuPath = async (): Promise<string | null> => {
  const path = await searchForExecutableOnPath('umu-run')
  if (path) return path

  const bundled = join(publicDir, 'bin', 'umu', 'umu-run')
  if (existsSync(bundled)) return bundled

  return null
}
