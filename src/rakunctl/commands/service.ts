import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { DMQueueElement, Runner } from 'common/types'
import {
  Api,
  CliError,
  createApi,
  credentialsFile,
  readCredentials
} from '../client'
import { Ctx, Options } from '../context'
import { forgetStarted } from '../serve'
import { webLines } from '../web'

const WAIT_MS = 15000
const POLL_MS = 100

type Io = Pick<Ctx, 'log'>

/** Where rakun writes its log: `rakunctl logs` needs rakun running, and it just failed to start */
export function logFile(env: NodeJS.ProcessEnv = process.env): string {
  const state = env.XDG_STATE_HOME || join(homedir(), '.local', 'state')
  return join(state, 'Rakun', 'logs', 'rakun.log')
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Whether rakun answers: with no `api.json` or no answer it is stopped */
export async function isRunning(file = credentialsFile()): Promise<boolean> {
  try {
    await createApi(readCredentials(file)).health()
    return true
  } catch {
    return false
  }
}

/** Installed: the `rakun` launcher beside rakunctl. From the checkout: node + rakun.cjs */
export function rakunCommand(dir: string): { cmd: string; args: string[] } {
  const launcher = join(dir, 'rakun')
  if (existsSync(launcher)) return { cmd: launcher, args: [] }
  return { cmd: process.execPath, args: [join(dir, 'rakun.cjs')] }
}

type Launched = {
  pid: number | undefined
  exited: () => number | null | undefined
}

export function launchRakun(
  dir = __dirname,
  extraArgs: string[] = []
): Launched {
  const { cmd, args } = rakunCommand(dir)
  const child = spawn(cmd, [...args, ...extraArgs], {
    detached: true,
    stdio: 'ignore'
  })
  let exitCode: number | null | undefined
  child.once('exit', (code) => (exitCode = code))
  child.once('error', () => (exitCode = -1))
  child.unref()
  return { pid: child.pid, exited: () => exitCode }
}

async function waitFor(condition: () => Promise<boolean>, ms = WAIT_MS) {
  for (let waited = 0; waited < ms; waited += POLL_MS) {
    if (await condition()) return true
    await sleep(POLL_MS)
  }
  return false
}

/**
 * Starts rakun detached and waits until it answers.
 * @returns the pid when this call started it, `undefined` when someone else did
 */
export async function startRakun(
  launch = launchRakun,
  running = isRunning
): Promise<number | undefined> {
  const launched = launch()
  const up = await waitFor(
    async () => (await running()) || launched.exited() !== undefined
  )
  if (!up || !(await running()))
    throw new CliError(
      `rakun no ha arrancado (código ${launched.exited() ?? 'sin respuesta'}): mira ${logFile()}`
    )
  return launched.exited() === undefined ? launched.pid : undefined
}

/** A download in the queue or a library refresh: stopping would cut it */
export async function isBusy(api: Api): Promise<boolean> {
  const queue = await api.call<{ elements: DMQueueElement[]; state: string }>(
    'getDMQueueInformation'
  )
  const refreshing = await api.call<Runner[]>('getRefreshingLibraries')
  return (
    (queue.elements.length > 0 && queue.state !== 'paused') ||
    refreshing.length > 0
  )
}

export async function stopRakun(force = false): Promise<void> {
  const api = createApi(readCredentials())
  if (!force && (await isBusy(api)))
    throw new CliError(
      'rakun está descargando o actualizando la biblioteca: pausa o cancela antes, o usa --force'
    )
  await api.call('stopRakun')
  if (!(await waitFor(async () => !(await isRunning()))))
    throw new CliError('rakun no ha terminado a tiempo')
}

/** `--web` and `--port` of `rakunctl start`, as the arguments of rakun (which checks them) */
export function rakunFlags(opts: Pick<Options, 'web' | 'port'>): string[] {
  return [
    ...(opts.web ? [`--web=${opts.web}`] : []),
    ...(opts.port ? [`--port=${opts.port}`] : [])
  ]
}

export async function start(ctx: Io, opts: Pick<Options, 'web' | 'port'> = {}) {
  if (await isRunning()) return ctx.log('rakun ya está arrancado')
  await startRakun(() => launchRakun(__dirname, rakunFlags(opts)))
  ctx.log('rakun arrancado')
  const creds = readCredentials()
  const { web } = await createApi(creds).health()
  webLines(web, creds.port).forEach((line) => ctx.log(line))
}

export async function stop(
  ctx: Io,
  opts: Pick<Options, 'force'>
): Promise<void> {
  if (!(await isRunning())) return ctx.log('rakun ya está parado')
  await stopRakun(opts.force)
  forgetStarted()
  ctx.log('rakun parado')
}
