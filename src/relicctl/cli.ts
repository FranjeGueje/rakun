import { parseArgs } from 'util'
import type { StoreInfo } from 'common/relic/stores'
import { Api, CliError, createApi, readCredentials } from './client'
import { Command, Ctx, Options } from './context'
import { call, events } from './commands/call'
import { importRelic, login, logout, status } from './commands/accounts'
import { install, repair, uninstall, update } from './commands/games'
import { library, refresh } from './commands/library'
import { cancel, pause, queue, resume } from './commands/queue'
import { logs } from './commands/logs'
import { cache, reset } from './commands/maintenance'
import { config } from './commands/config'

export const HELP = `Uso: relicctl <comando> [argumentos]

  status                          estado de relicd, sesiones y cola
  login <tienda>                  inicia sesión
  logout <tienda>
  import-relic                    copia las sesiones de Relic
  library [tienda] [--installed]  lista la biblioteca
  refresh [tienda]                actualiza la biblioteca y espera
  install <tienda> <appName> [--path DIR] [--lang CODE] [--skip-dlcs]
  update | repair | uninstall <tienda> <appName>
  queue [clear]                   cola de descargas (clear vacía las terminadas)
  pause | resume                  pausa o reanuda la cola
  cancel [--remove-files]         cancela la descarga actual
  logs [tienda [appName]] [--type T]  registro de relicd, de una tienda o de un juego
  cache clear [tienda]            vacía la caché de las bibliotecas
  reset [--yes]                   borra sesiones y ajustes y detiene relicd
  config [clave [valor]]          ver o cambiar ajustes (p. ej. defaultInstallPath)
  events                          sigue los eventos de relicd
  call <canal> [json]             llama a un canal de la API

Opciones: --json (salida para scripts), --no-wait (no esperar a que termine)
Las tiendas son las que informa relicd (relicctl call getStores).
Variable: RELICD_API_FILE (api.json de otro relicd)`

export const commands: Record<string, Command> = {
  status,
  login,
  logout,
  'import-relic': importRelic,
  library,
  refresh,
  install,
  update,
  repair,
  uninstall,
  queue,
  pause,
  resume,
  cancel,
  cache,
  reset,
  config,
  logs,
  events,
  call
}

export function parseCli(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: 'boolean' },
      path: { type: 'string' },
      lang: { type: 'string' },
      type: { type: 'string' },
      'skip-dlcs': { type: 'boolean' },
      'remove-files': { type: 'boolean' },
      yes: { type: 'boolean' },
      'no-wait': { type: 'boolean' },
      installed: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' }
    }
  })
  const opts: Options = {
    path: values.path,
    lang: values.lang,
    type: values.type,
    skipDlcs: values['skip-dlcs'],
    removeFiles: values['remove-files'],
    yes: values.yes,
    wait: !values['no-wait'],
    installed: !!values.installed
  }
  const [command, ...args] = positionals
  return { command, args, opts, json: !!values.json, help: !!values.help }
}

/** Asks relicd for its stores the first time and remembers the answer */
function storesOf(api: Api): () => Promise<StoreInfo[]> {
  let stores: Promise<StoreInfo[]> | undefined
  return () => (stores ??= api.call<StoreInfo[]>('getStores'))
}

export async function runCli(
  argv: string[],
  io: Pick<Ctx, 'log' | 'ask'>
): Promise<void> {
  const { command, args, opts, json, help } = parseCli(argv)
  if (help || !command) return io.log(HELP)
  const handler = commands[command]
  if (!handler)
    throw new CliError(`Comando desconocido "${command}"\n\n${HELP}`)
  const api = createApi(readCredentials())
  await handler({ ...io, api, stores: storesOf(api), json }, args, opts)
}
