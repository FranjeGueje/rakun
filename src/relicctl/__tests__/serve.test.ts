import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { dirSync } from '../../backend/__tests__/tmp_dir'
import { ServeDeps, withServe } from '../serve'

const dir = dirSync()
afterAll(() => dir.removeCallback())

/** A fake relicd: `running` says whether it answers and `live` which pids exist */
function world(
  options: { running?: boolean; busy?: boolean; startPid?: number } = {}
) {
  const state = {
    running: options.running ?? false,
    stops: 0,
    starts: 0,
    live: new Set<number>()
  }
  const deps = (pid: number): ServeDeps => ({
    dir: join(dir.name, 'serve'),
    pid,
    isRunning: () => Promise.resolve(state.running),
    start: () => {
      state.starts++
      state.running = true
      state.live.add(options.startPid ?? 9000)
      return Promise.resolve(options.startPid ?? 9000)
    },
    stop: () => {
      state.stops++
      state.running = false
      return Promise.resolve()
    },
    isBusy: () => Promise.resolve(options.busy ?? false),
    alive: (p) => state.live.has(p)
  })
  return { state, deps }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(() => {
  // every test starts with an empty serve folder
  require('fs').rmSync(join(dir.name, 'serve'), {
    recursive: true,
    force: true
  })
})

describe('withServe', () => {
  test('starts relicd, runs the command and stops it afterwards', async () => {
    const { state, deps } = world()
    state.live.add(1001)

    const result = await withServe(deps(1001), () => Promise.resolve('hecho'))

    expect(result).toBe('hecho')
    expect([state.starts, state.stops]).toEqual([1, 1])
    expect(existsSync(join(dir.name, 'serve', 'started'))).toBe(false)
  })

  test('never stops a relicd that was already running', async () => {
    const { state, deps } = world({ running: true })
    state.live.add(1001)

    await withServe(deps(1001), () => Promise.resolve())

    expect([state.starts, state.stops]).toEqual([0, 0])
  })

  test('stops it even when the command fails', async () => {
    const { state, deps } = world()
    state.live.add(1001)

    await expect(
      withServe(deps(1001), () => Promise.reject(new Error('fallo')))
    ).rejects.toThrow('fallo')

    expect(state.stops).toBe(1)
  })

  test('the last one to finish stops it, not the one that started it', async () => {
    const { state, deps } = world()
    state.live.add(1001).add(1002)

    const long = withServe(deps(1001), () => sleep(150))
    await sleep(20)
    const short = withServe(deps(1002), () => sleep(10))
    await short
    expect(state.stops).toBe(0)
    await long

    expect([state.starts, state.stops]).toEqual([1, 1])
  })

  test('the one that did not start it can be the last', async () => {
    const { state, deps } = world()
    state.live.add(1001).add(1002)

    const starter = withServe(deps(1001), () => sleep(60))
    await sleep(20)
    const second = withServe(deps(1002), () => sleep(120))
    await starter
    expect(state.stops).toBe(0)
    await second

    expect(state.stops).toBe(1)
  })

  test('a lease of a dead command does not keep relicd up', async () => {
    const { state, deps } = world()
    state.live.add(1001)
    require('fs').mkdirSync(join(dir.name, 'serve'), { recursive: true })
    writeFileSync(join(dir.name, 'serve', '4242'), '')

    await withServe(deps(1001), () => Promise.resolve())

    expect(state.stops).toBe(1)
    expect(existsSync(join(dir.name, 'serve', '4242'))).toBe(false)
  })

  test('leaves relicd up, and the marker, while it is busy', async () => {
    const { state, deps } = world({ busy: true })
    state.live.add(1001)

    await withServe(deps(1001), () => Promise.resolve())

    expect(state.stops).toBe(0)
    expect(readFileSync(join(dir.name, 'serve', 'started'), 'utf-8')).toBe(
      '9000'
    )
  })

  test('a stale marker never stops a relicd started another way', async () => {
    const { state, deps } = world({ running: true })
    state.live.add(1001)
    require('fs').mkdirSync(join(dir.name, 'serve'), { recursive: true })
    writeFileSync(join(dir.name, 'serve', 'started'), '777')

    await withServe(deps(1001), () => Promise.resolve())

    expect(state.stops).toBe(0)
    expect(existsSync(join(dir.name, 'serve', 'started'))).toBe(false)
  })
})
