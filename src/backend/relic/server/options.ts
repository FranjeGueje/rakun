import { parseArgs } from 'util'
import { isWebAccess, WEB_ACCESS_MODES, type WebAccess } from 'common/relic/web'

export type ServerOptions = {
  web: WebAccess
  /** Only when asked for (`--port` or `RELICD_PORT`); otherwise `api.json` decides */
  port: number | undefined
}

function parsePort(text: string): number {
  const port = Number(text)
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`Invalid port "${text}": it has to be from 1 to 65535`)
  return port
}

function parseMode(text: string): WebAccess {
  if (!isWebAccess(text))
    throw new Error(
      `Invalid web mode "${text}": use ${WEB_ACCESS_MODES.join(', ')}`
    )
  return text
}

/**
 * How relicd starts: the arguments (`--web=network --port=18000`) win over the
 * environment (`RELICD_WEB`, `RELICD_PORT`), which wins over the saved setting
 * `webAccess`. Throws a readable message when a value is not valid.
 */
export function parseServerOptions(
  argv: string[],
  env: NodeJS.ProcessEnv,
  saved: unknown
): ServerOptions {
  const { values } = parseArgs({
    args: argv,
    options: { web: { type: 'string' }, port: { type: 'string' } }
  })
  const web = values.web ?? env.RELICD_WEB
  const port = values.port ?? env.RELICD_PORT
  return {
    web: web ? parseMode(web) : isWebAccess(saved) ? saved : 'local',
    port: port ? parsePort(port) : undefined
  }
}
