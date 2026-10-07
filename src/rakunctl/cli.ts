import { parseArgs } from 'util'
import type { StoreInfo } from 'common/rakun/stores'
import { Api, CliError, createApi, readCredentials } from './client'
import { Command, Ctx, Options } from './context'
import { call, events } from './commands/call'
import { importRelic, login, logout, status } from './commands/accounts'
import { install, repair, uninstall, update } from './commands/games'
import { library, refresh } from './commands/library'
import { cancel, pause, queue, resume } from './commands/queue'
import { logs } from './commands/logs'
import { cache, reset } from './commands/maintenance'
import {
  isBusy,
  isRunning,
  start,
  startRakun,
  stop,
  stopRakun
} from './commands/service'
import { ServeDeps, serveDir, processAlive, withServe } from './serve'
import { config } from './commands/config'
import { installService, uninstallService } from './commands/systemd'

export const HELP = `Uso: rakunctl <comando> [argumentos]

  start | stop [--force]          arranca o para rakun (no hace falta systemd)
  start [--web local|network|off] [--port N]
                                  quién abre la web (por defecto el ajuste webAccess) y el puerto
  install-service [--web local|network|off] [--port N] | uninstall-service
                                  rakun como servicio de usuario de systemd (arranca al iniciar sesión)
  status                          estado de rakun, sesiones y cola
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
  logs [tienda [appName]] [--type T]  registro de rakun, de una tienda o de un juego
  cache clear [tienda]            vacía la caché de las bibliotecas
  reset [--yes]                   borra sesiones y ajustes y detiene rakun
  config [clave [valor]]          ver o cambiar ajustes (p. ej. defaultInstallPath)
  events                          sigue los eventos de rakun
  call <canal> [json]             llama a un canal de la API

Opciones: --json (salida para scripts), --no-wait (no esperar a que termine),
  -s (si rakun está parado, lo arranca para este comando y lo para al acabar)
Las tiendas son las que informa rakun (rakunctl call getStores).
Variable: RAKUN_API_FILE (api.json de otro rakun)`

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
      force: { type: 'boolean' },
      serve: { type: 'boolean', short: 's' },
      web: { type: 'string' },
      port: { type: 'string' },
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
    force: values.force,
    serve: values.serve,
    web: values.web,
    port: values.port,
    wait: !values['no-wait'],
    installed: !!values.installed
  }
  const [command, ...args] = positionals
  return { command, args, opts, json: !!values.json, help: !!values.help }
}

/** Asks rakun for its stores the first time and remembers the answer */
function storesOf(api: Api): () => Promise<StoreInfo[]> {
  let stores: Promise<StoreInfo[]> | undefined
  return () => (stores ??= api.call<StoreInfo[]>('getStores'))
}

function serveDeps(): ServeDeps {
  const api = () => createApi(readCredentials())
  return {
    dir: serveDir(),
    pid: process.pid,
    isRunning: () => isRunning(),
    start: () => startRakun(),
    stop: () => stopRakun(),
    isBusy: async () => isBusy(api()),
    alive: processAlive
  }
}

const SERVICE_COMMANDS = [
  'start',
  'stop',
  'install-service',
  'uninstall-service'
]

/** -s cannot work with what outlives the command or has no end */
export function checkServe(command: string, opts: Options) {
  if (SERVICE_COMMANDS.includes(command))
    throw new CliError(`-s no se usa con ${command}`)
  if (command === 'events')
    throw new CliError('-s no se puede usar con events: no termina')
  if (!opts.wait)
    throw new CliError(
      '-s no se puede usar con --no-wait: rakun pararía lo que acabas de encolar'
    )
}

async function runCommand(
  io: Pick<Ctx, 'log' | 'ask'>,
  handler: Command,
  args: string[],
  opts: Options,
  json: boolean
) {
  const api = createApi(readCredentials())
  await handler({ ...io, api, stores: storesOf(api), json }, args, opts)
}

export async function runCli(
  argv: string[],
  io: Pick<Ctx, 'log' | 'ask'>,
  serve: () => ServeDeps = serveDeps
): Promise<void> {
  const { command, args, opts, json, help } = parseCli(argv)
  if (help || !command) return io.log(HELP)
  if (opts.serve) checkServe(command, opts)
  if (command === 'start') return start(io, opts)
  if (command === 'stop') return stop(io, opts)
  if (command === 'install-service') return installService(io, opts)
  if (command === 'uninstall-service') return uninstallService(io)
  const handler = commands[command]
  if (!handler)
    throw new CliError(`Comando desconocido "${command}"\n\n${HELP}`)
  if (opts.serve) {
    return withServe(serve(), () => runCommand(io, handler, args, opts, json))
  }
  if (command === 'status' && !(await isRunning()))
    return io.log(
      json
        ? JSON.stringify({ running: false })
        : 'rakun parado; arráncalo con "rakunctl start"'
    )
  await runCommand(io, handler, args, opts, json)
}
