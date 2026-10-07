import { parseArgs } from 'util'
import type { StoreInfo } from 'common/rakun/stores'
import { Api, CliError, createApi, readCredentials } from './client'
import { Command, Ctx, Options } from './context'
import { call, events } from './commands/call'
import { importRelic, login, logout, status } from './commands/accounts'
import {
  importFolder,
  install,
  repair,
  uninstall,
  update
} from './commands/games'
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

export const HELP = `Usage: rakunctl [options] <command> [arguments]

Service
  start [--web MODE] [--port N]     Start rakun in the background
  stop [--force]                    Stop it (--force: even while downloading)
  status                            Show rakun, sessions and queue
  install-service [--web MODE] [--port N]
                                    Install it as a systemd user service
                                    (starts at login)
  uninstall-service                 Remove the service and stop rakun

Accounts
  login <store>                     Log in
  logout <store>                    Log out
  import-relic                      Copy the sessions of Relic

Library
  library [store] [--installed]     List the games
  refresh [store]                   Refresh the library and wait

Games
  install <store> <appName> [--path DIR] [--lang CODE] [--skip-dlcs]
          [--platform windows|linux]
                                    Install a game (a game with both builds gets
                                    the Linux one unless --platform says otherwise)
  import <store> <appName> <folder> [--platform windows|linux]
                                    Register a game that is already in a folder
  update [store [appName]]          Update one game, a store's games, or every
                                    game with a new version
  repair <store> <appName>          Repair a game
  uninstall <store> <appName>       Uninstall a game and delete its files

Download queue
  queue [clear]                     Show the queue (clear: empty the finished
                                    list)
  pause | resume                    Pause or resume the queue
  cancel [--remove-files]           Cancel the current download

Maintenance
  config [key [value]]              Show or change settings (e.g.
                                    defaultInstallPath)
  logs [store [appName]] [--type T]
                                    Show the log of rakun, of a store or of a
                                    game
  cache clear [store]               Clear the library cache
  reset [--yes]                     Delete sessions and settings, and stop
                                    rakun

Advanced
  events                            Follow the events of rakun
  call <channel> [json]             Call a channel of the API

Options
  --json            Output for scripts
  --no-wait         Do not wait for what is queued to finish
  -s                If rakun is stopped, start it just for this command and stop
                    it afterwards
  -h, --help        This help

MODE of --web: local (this machine only), network (the whole network, WITHOUT
protection) or off. Without it the webAccess setting is used.
The stores are the ones rakun reports (rakunctl call getStores).
Variable: RAKUN_API_FILE (api.json of another rakun)`

export const commands: Record<string, Command> = {
  status,
  login,
  logout,
  'import-relic': importRelic,
  library,
  refresh,
  install,
  import: importFolder,
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
      platform: { type: 'string' },
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
    platform: values.platform,
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
    throw new CliError(`-s cannot be used with ${command}`)
  if (command === 'events')
    throw new CliError('-s cannot be used with events: it never ends')
  if (!opts.wait)
    throw new CliError(
      '-s cannot be used with --no-wait: rakun would stop what you just queued'
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
  if (!handler) throw new CliError(`Unknown command "${command}"\n\n${HELP}`)
  if (opts.serve) {
    return withServe(serve(), () => runCommand(io, handler, args, opts, json))
  }
  if (command === 'status' && !(await isRunning()))
    return io.log(
      json
        ? JSON.stringify({ running: false })
        : 'rakun is stopped; start it with "rakunctl start"'
    )
  await runCommand(io, handler, args, opts, json)
}
