import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export const UNIT = 'rakun.service'

/** Where systemd looks for the units of the user */
export function unitPath(env: NodeJS.ProcessEnv = process.env): string {
  const config = env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(config, 'systemd', 'user', UNIT)
}

export const serviceInstalled = (file = unitPath()) => existsSync(file)
