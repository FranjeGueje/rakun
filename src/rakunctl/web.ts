import { networkInterfaces } from 'os'

const NETWORK_WARNING =
  'AVISO: la web está abierta a toda la red SIN protección: cualquiera que llegue a este equipo controla rakun. Solo para uso experimental o doméstico.'

/** The addresses other machines can reach this one by */
export function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((list) => list ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address)
}

/** What `start` and `status` tell about the web: where it is, and the warning when it is open to the network */
export function webLines(
  web: string | undefined,
  port: number,
  addresses: string[] = lanAddresses()
): string[] {
  if (web === 'off') return ['Web: desactivada']
  if (web === 'network')
    return [
      `Web: ${[`http://127.0.0.1:${port}`, ...addresses.map((a) => `http://${a}:${port}`)].join('  ')}`,
      NETWORK_WARNING
    ]
  return web ? [`Web: http://127.0.0.1:${port}`] : []
}
