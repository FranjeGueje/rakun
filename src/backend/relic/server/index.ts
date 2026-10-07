import { GlobalConfig } from 'backend/config'
import { logError, LogPrefix } from 'backend/logger'
import { loadOrCreateCredentials } from './credentials'
import { parseServerOptions } from './options'
import { createApiServer, listenApiServer } from './server'

/** Starts the API (and the web) the way the arguments, the environment and the settings say */
export async function startApiServer(argv: string[] = process.argv.slice(2)) {
  let options
  try {
    options = parseServerOptions(
      argv,
      process.env,
      GlobalConfig.get().getSettings().webAccess
    )
  } catch (error) {
    logError(`Cannot start: ${String(error)}`, LogPrefix.Backend)
    throw error
  }
  const env = options.port
    ? { ...process.env, RELICD_PORT: String(options.port) }
    : process.env
  const credentials = loadOrCreateCredentials(undefined, env)
  await listenApiServer(
    createApiServer(credentials.token, { web: options.web }),
    credentials.port,
    options.web
  )
}
