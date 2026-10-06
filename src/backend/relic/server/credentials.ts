import { randomBytes } from 'crypto'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { appFolder } from 'backend/constants/paths'

export const DEFAULT_PORT = 17370

export type ApiCredentials = { port: number; token: string }

export const credentialsPath = join(appFolder, 'api.json')

function isCredentials(value: unknown): value is ApiCredentials {
  const candidate = value as Partial<ApiCredentials> | null
  return (
    typeof candidate?.port === 'number' && typeof candidate.token === 'string'
  )
}

function readCredentials(path: string): ApiCredentials | undefined {
  if (!existsSync(path)) return undefined
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'))
    return isCredentials(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * The token lives in a file only the user can read; clients (the Invasor
 * module) read it from there. It is generated once and kept across restarts.
 * `RELICD_PORT` overrides the stored port.
 */
export function loadOrCreateCredentials(
  path = credentialsPath,
  env: NodeJS.ProcessEnv = process.env
): ApiCredentials {
  const stored = readCredentials(path)
  const port = Number(env.RELICD_PORT) || stored?.port || DEFAULT_PORT
  const token = stored?.token ?? randomBytes(32).toString('hex')

  const credentials = { port, token }
  if (stored?.port !== port || stored.token !== token) {
    writeFileSync(path, JSON.stringify(credentials), { mode: 0o600 })
    chmodSync(path, 0o600)
  }
  return credentials
}
