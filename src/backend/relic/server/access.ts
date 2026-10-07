import { hostname, networkInterfaces } from 'os'
import type { WebAccess } from 'common/relic/web'

const LOOPBACK_NAMES = ['localhost', '127.0.0.1', '[::1]']

/**
 * What changes the settings, stops relicd, reads a secret or walks the disk.
 * Setting `altLegendaryBin` makes relicd run that program, so with the web open
 * to the network these are only answered to this machine. `install` with a
 * `path` is not here: it is how the web installs, and it stays open.
 */
const LOCAL_ONLY_CHANNELS: ReadonlySet<string> = new Set([
  // Settings, reset and stop
  'writeConfig',
  'setSetting',
  'resetRelic',
  'stopRelicd',
  'steamgriddb.setApiKey',
  'importSessionsFromRelic',
  // Secrets and what is on the disk
  'getPrivateBranchPassword',
  'setPrivateBranchPassword',
  'getLogContent',
  'listFolders',
  // Move or register game folders anywhere
  'importGame',
  'moveInstall',
  'changeInstallPath'
])

export function isLoopback(address: string | undefined): boolean {
  if (!address) return false
  return (
    address === '::1' ||
    address.startsWith('127.') ||
    address.startsWith('::ffff:127.')
  )
}

/** The addresses and names this machine answers to, apart from localhost */
export function ownNames(): string[] {
  const name = hostname().toLowerCase()
  const addresses = Object.values(networkInterfaces())
    .flatMap((list) => list ?? [])
    .map((entry) => entry.address.split('%')[0])
    .map((address) => (address.includes(':') ? `[${address}]` : address))
  return [name, `${name}.local`, ...addresses]
}

/**
 * The `Host` values that may reach relicd. Anything else is refused: a web
 * that points its own domain at relicd (DNS rebinding) sends its own `Host`.
 */
export function allowedHosts(
  port: number,
  mode: WebAccess,
  names: string[] = ownNames()
): Set<string> {
  const hosts =
    mode === 'network' ? [...LOOPBACK_NAMES, ...names] : LOOPBACK_NAMES
  return new Set(hosts.map((host) => `${host}:${port}`))
}

/** A browser may call relicd only from relicd's own page: its Origin is the Host it was loaded from */
export function isOwnOrigin(origin: string | undefined, host: string): boolean {
  return origin === undefined || origin === `http://${host}`
}

export function isBlockedFromNetwork(
  channel: string,
  remoteAddress: string | undefined,
  mode: WebAccess
): boolean {
  return (
    mode === 'network' &&
    !isLoopback(remoteAddress) &&
    LOCAL_ONLY_CHANNELS.has(channel)
  )
}
