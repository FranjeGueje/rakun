import { execFile } from 'child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { promisify } from 'util'
import { CliError } from '../client'
import { Ctx, Options } from '../context'
import { NETWORK_WARNING } from '../web'
import { isRunning, rakunCommand, rakunFlags } from './service'
import { serviceInstalled, UNIT, unitPath } from './unit'

type Io = Pick<Ctx, 'log'>
type Flags = Pick<Options, 'web' | 'port'>

const WEB_MODES = ['local', 'network', 'off']
type Systemctl = (args: string[]) => Promise<void>

const ZOOM_WARNING =
  'WARNING: the service has no screen (DISPLAY): Zoom installers open a window and will not work with it. For Zoom, stop the service and start rakun from the desktop.'

/** One word of an `ExecStart` line: quoted, with `\`, `"` and `%` escaped */
export function systemdQuote(word: string): string {
  return `"${word.replace(/[\\"]/g, '\\$&').replaceAll('%', '%%')}"`
}

/**
 * The unit: `on-failure` so that `rakunctl stop` (a clean exit) really stops it
 * until the next login.
 */
export function unitText(command: { cmd: string; args: string[] }): string {
  const exec = [command.cmd, ...command.args].map(systemdQuote).join(' ')
  return [
    '[Unit]',
    'Description=rakun',
    '',
    '[Service]',
    `ExecStart=${exec}`,
    'Restart=on-failure',
    '',
    '[Install]',
    'WantedBy=default.target',
    ''
  ].join('\n')
}

/** The `webAccess` rakun will start with, read from its saved settings (`local` when there is none) */
export function savedWebAccess(
  file = join(homedir(), '.config', 'rakun', 'config.json')
): string {
  try {
    const saved = JSON.parse(readFileSync(file, 'utf-8')) as {
      settings?: { webAccess?: string }
      defaultSettings?: { webAccess?: string }
    }
    return saved.settings?.webAccess ?? saved.defaultSettings?.webAccess ?? ''
  } catch {
    return ''
  }
}

const run = promisify(execFile)

export const systemctl: Systemctl = async (args) => {
  try {
    await run('systemctl', ['--user', ...args])
  } catch (error) {
    throw new CliError(
      `systemctl --user ${args.join(' ')} failed: ${String(error)}`
    )
  }
}

/** rakun refuses a bad value when it starts: the service would fail at every login, so say it now */
export function checkFlags(opts: Flags): void {
  if (opts.web && !WEB_MODES.includes(opts.web))
    throw new CliError(`--web must be ${WEB_MODES.join(', ')}`)
  const port = Number(opts.port)
  if (opts.port && !(Number.isInteger(port) && port >= 1 && port <= 65535))
    throw new CliError('--port must be a number between 1 and 65535')
}

export async function installService(
  ctx: Io,
  opts: Flags = {},
  deps: {
    file?: string
    dir?: string
    ctl?: Systemctl
    running?: () => Promise<boolean>
    web?: () => string
  } = {}
): Promise<void> {
  checkFlags(opts)
  const file = deps.file ?? unitPath()
  const ctl = deps.ctl ?? systemctl
  const { cmd, args } = rakunCommand(deps.dir ?? __dirname)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, unitText({ cmd, args: [...args, ...rakunFlags(opts)] }))
  await ctl(['daemon-reload'])
  // A rakun started by hand already has the port: the service would not start
  const running = await (deps.running ?? isRunning)()
  await ctl(running ? ['enable', UNIT] : ['enable', '--now', UNIT])
  ctx.log(
    running
      ? 'Service installed: it will start at your next login (rakun is already running)'
      : 'Service installed and started: rakun now starts by itself at login'
  )
  const web = opts.web ?? (deps.web ?? savedWebAccess)()
  if (web === 'network') ctx.log(NETWORK_WARNING)
  ctx.log(ZOOM_WARNING)
}

export async function uninstallService(
  ctx: Io,
  deps: { file?: string; ctl?: Systemctl } = {}
): Promise<void> {
  const file = deps.file ?? unitPath()
  const ctl = deps.ctl ?? systemctl
  if (!serviceInstalled(file)) return ctx.log('The service is not installed')
  await ctl(['disable', '--now', UNIT])
  rmSync(file, { force: true })
  await ctl(['daemon-reload'])
  ctx.log('Service uninstalled and rakun stopped')
}
