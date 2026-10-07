import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const STARTED = 'started'
const LOCK = 'lock'
const LOCK_WAIT_MS = 30000

/** What `-s` needs from relicd; every piece can be replaced in the tests */
export type ServeDeps = {
  dir: string
  /** The pid of this command: its lease file */
  pid: number
  isRunning: () => Promise<boolean>
  /** Starts relicd; resolves with its pid when this call started it */
  start: () => Promise<number | undefined>
  stop: () => Promise<void>
  isBusy: () => Promise<boolean>
  alive: (pid: number) => boolean
}

export function serveDir(): string {
  const state = process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state')
  return join(state, 'Relicd', 'serve')
}

/** The marker said this folder started relicd: `relicctl stop` makes it stale */
export function forgetStarted(dir = serveDir()) {
  rmSync(join(dir, STARTED), { force: true })
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** One `-s` at a time looks at or changes the files: `mkdir` fails if it exists */
async function withLock<T>(dir: string, action: () => Promise<T>): Promise<T> {
  const lock = join(dir, LOCK)
  for (let waited = 0; ; waited += 50) {
    try {
      mkdirSync(lock)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      // Whoever held it for that long is dead: take it over
      if (waited >= LOCK_WAIT_MS) rmSync(lock, { recursive: true, force: true })
      else await sleep(50)
    }
  }
  try {
    return await action()
  } finally {
    rmSync(lock, { recursive: true, force: true })
  }
}

/** The pids of the `-s` commands still running */
function liveLeases(dir: string, deps: ServeDeps): number[] {
  return readdirSync(dir)
    .filter((name) => /^\d+$/.test(name))
    .map(Number)
    .filter((pid) => {
      const alive = deps.alive(pid)
      if (!alive) rmSync(join(dir, String(pid)), { force: true })
      return alive
    })
}

function readStartedPid(dir: string): number | undefined {
  try {
    return Number(readFileSync(join(dir, STARTED), 'utf-8')) || undefined
  } catch {
    return undefined
  }
}

async function register(deps: ServeDeps) {
  writeFileSync(join(deps.dir, String(deps.pid)), '')
  if (await deps.isRunning()) return
  forgetStarted(deps.dir)
  const pid = await deps.start()
  if (pid) writeFileSync(join(deps.dir, STARTED), String(pid))
}

/** The last `-s` to finish stops relicd, but only one that a `-s` started */
async function unregister(deps: ServeDeps) {
  rmSync(join(deps.dir, String(deps.pid)), { force: true })
  if (liveLeases(deps.dir, deps).length > 0) return
  const startedPid = readStartedPid(deps.dir)
  if (startedPid === undefined) return
  if (!(await deps.isRunning())) return forgetStarted(deps.dir)
  if (!deps.alive(startedPid)) return forgetStarted(deps.dir)
  if (await deps.isBusy()) return
  await deps.stop()
  forgetStarted(deps.dir)
}

/** Runs `action` with relicd up, and stops it afterwards if nobody else needs it */
export async function withServe<T>(
  deps: ServeDeps,
  action: () => Promise<T>
): Promise<T> {
  mkdirSync(deps.dir, { recursive: true })
  try {
    await withLock(deps.dir, () => register(deps))
    return await action()
  } finally {
    await withLock(deps.dir, () => unregister(deps))
  }
}
