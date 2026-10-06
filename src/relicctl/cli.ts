import { parseArgs } from 'util'
import { CliError, createApi, readCredentials } from './client'
import { Command, Ctx, Options } from './context'
import { call, events } from './commands/call'
import { importRelic, login, logout, status } from './commands/accounts'
import { install, repair, uninstall, update } from './commands/games'
import { library, refresh } from './commands/library'
import { queue } from './commands/queue'

export const HELP = `Uso: relicctl <comando> [argumentos]

  status                          estado de relicd, sesiones y cola
  login <tienda>                  inicia sesión (epic, gog, amazon, zoom)
  logout <tienda>
  import-relic                    copia las sesiones de Relic
  library [tienda] [--installed]  lista la biblioteca
  refresh [tienda]                actualiza la biblioteca y espera
  install <tienda> <appName> [--path DIR]
  update | repair | uninstall <tienda> <appName>
  queue                           cola de descargas
  events                          sigue los eventos de relicd
  call <canal> [json]             llama a un canal de la API

Opciones: --json (salida para scripts), --no-wait (no esperar a que termine)
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
      'no-wait': { type: 'boolean' },
      installed: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' }
    }
  })
  const opts: Options = {
    path: values.path,
    wait: !values['no-wait'],
    installed: !!values.installed
  }
  const [command, ...args] = positionals
  return { command, args, opts, json: !!values.json, help: !!values.help }
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
  await handler({ ...io, api, json }, args, opts)
}
