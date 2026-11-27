import { spawn, type ChildProcess } from 'child_process'
import { once } from 'events'
import { killProcessGroup, killUnlessItEnds } from '../process_group'

/**
 * A helper like gogdl: it starts a worker of its own and waits for it. It says
 * the worker's pid on stdout
 */
async function helperWithWorker() {
  const child = spawn('sh', ['-c', 'sleep 60 & echo $!; wait'], {
    detached: true
  })
  const [data] = (await once(child.stdout, 'data')) as [Buffer]
  return { child, worker: Number(data.toString().trim()) }
}

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const ended = (child: ChildProcess) =>
  child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : once(child, 'exit')

/** The worker is reaped by init after its parent dies: wait a little for it */
async function waitUntilGone(pid: number) {
  for (let i = 0; i < 50 && isAlive(pid); i++) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return !isAlive(pid)
}

describe('killProcessGroup', () => {
  test('the helper and the worker it started both stop', async () => {
    const { child, worker } = await helperWithWorker()

    killProcessGroup(child)
    await ended(child)

    expect(child.signalCode).toBe('SIGTERM')
    expect(await waitUntilGone(worker)).toBe(true)
  })

  test('a helper without its own group is stopped alone', async () => {
    const child = spawn('sleep', ['60'])

    killProcessGroup(child)
    await ended(child)

    expect(child.signalCode).toBe('SIGTERM')
  })
})

describe('killUnlessItEnds', () => {
  test('a helper still there after the grace time is killed, with its worker', async () => {
    const { child, worker } = await helperWithWorker()

    killUnlessItEnds(child, 10)
    await ended(child)

    expect(child.signalCode).toBe('SIGKILL')
    expect(await waitUntilGone(worker)).toBe(true)
  })

  test('a helper that ends by itself in time is left alone', async () => {
    const child = spawn('sh', ['-c', 'exit 0'], { detached: true })
    const kill = jest.spyOn(process, 'kill')

    killUnlessItEnds(child, 200)
    await ended(child)
    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(child.exitCode).toBe(0)
    expect(kill).not.toHaveBeenCalled()
    kill.mockRestore()
  })

  test('asking again for the same helper does not stack more kills', async () => {
    const { child } = await helperWithWorker()
    const kill = jest.spyOn(process, 'kill')

    killUnlessItEnds(child, 10)
    killUnlessItEnds(child, 10)
    await ended(child)

    expect(
      kill.mock.calls.filter(([, signal]) => signal === 'SIGKILL')
    ).toHaveLength(1)
    kill.mockRestore()
  })
})
