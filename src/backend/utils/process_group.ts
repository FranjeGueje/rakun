import type { ChildProcess } from 'child_process'

/**
 * Sends a signal to a helper and to every process it started. The helper must
 * have been spawned with `detached: true`, so it leads its own process group:
 * gogdl, legendary and nile run their workers as separate processes (gogdl
 * through a forkserver), and killing only the helper left them behind, stuck.
 * Falls back to the helper alone when there is no such group.
 */
export function killProcessGroup(
  child: ChildProcess,
  signal: NodeJS.Signals = 'SIGTERM'
): void {
  if (child.pid === undefined) return
  try {
    process.kill(-child.pid, signal)
  } catch {
    child.kill(signal)
  }
}

const hasEnded = (child: ChildProcess) =>
  child.exitCode !== null || child.signalCode !== null

const scheduled = new WeakSet<ChildProcess>()

/**
 * Gives a helper that already failed some time to end by itself and, if it is
 * still there, kills it with its whole group. Calling it again for the same
 * helper does nothing.
 */
export function killUnlessItEnds(child: ChildProcess, graceMs: number): void {
  if (scheduled.has(child) || hasEnded(child)) return
  scheduled.add(child)
  const timer = setTimeout(() => killProcessGroup(child, 'SIGKILL'), graceMs)
  timer.unref()
  child.once('exit', () => clearTimeout(timer))
}
