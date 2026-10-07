import { spawn } from 'child_process'
import { existsSync } from 'fs'
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

const WAIT_MS = 15000
const POLL_MS = 100

type Io = Pick<Ctx, 'log'>

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Whether relicd answers: with no `api.json` or no answer it is stopped */
export async function isRunning(file = credentialsFile()): Promise<boolean> {
  try {
    await createApi(readCredentials(file)).health()
    return true
  } catch {
    return false
  }
}

/** Installed: the `relicd` launcher beside relicctl. From the checkout: node + relicd.cjs */
export function relicdCommand(dir: string): { cmd: string; args: string[] } {
  const launcher = join(dir, 'relicd')
  if (existsSync(launcher)) return { cmd: launcher, args: [] }
  return { cmd: process.execPath, args: [join(dir, 'relicd.cjs')] }
}

type Launched = {
  pid: number | undefined
  exited: () => number | null | undefined
}

function launchRelicd(dir = __dirname): Launched {
  const { cmd, args } = relicdCommand(dir)
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
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
 * Starts relicd detached and waits until it answers.
 * @returns the pid when this call started it, `undefined` when someone else did
 */
export async function startRelicd(
  launch = launchRelicd,
  running = isRunning
): Promise<number | undefined> {
  const launched = launch()
  const up = await waitFor(
    async () => (await running()) || launched.exited() !== undefined
  )
  if (!up || !(await running()))
    throw new CliError(
      `relicd no ha arrancado (código ${launched.exited() ?? 'sin respuesta'}): mira "relicctl logs"`
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

export async function stopRelicd(force = false): Promise<void> {
  const api = createApi(readCredentials())
  if (!force && (await isBusy(api)))
    throw new CliError(
      'relicd está descargando o actualizando la biblioteca: pausa o cancela antes, o usa --force'
    )
  await api.call('stopRelicd')
  if (!(await waitFor(async () => !(await isRunning()))))
    throw new CliError('relicd no ha terminado a tiempo')
}

export async function start(ctx: Io): Promise<void> {
  if (await isRunning()) return ctx.log('relicd ya está arrancado')
  await startRelicd()
  ctx.log('relicd arrancado')
}

export async function stop(
  ctx: Io,
  opts: Pick<Options, 'force'>
): Promise<void> {
  if (!(await isRunning())) return ctx.log('relicd ya está parado')
  await stopRelicd(opts.force)
  forgetStarted()
  ctx.log('relicd parado')
}
