import { mkdirSync, mkdtempSync, existsSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  LogPrefix: { Itch: 'Itch' }
}))

import { logError } from 'backend/logger'
import type { Butlerd } from '../butlerd'
import {
  discardPartialInstall,
  inTurn,
  OperationAborted,
  runOperation,
  type Queued
} from '../operation'

const QUEUED: Queued = {
  id: 'op-1',
  caveId: 'cave-1',
  installFolder: '/games/game',
  stagingFolder: '/games/downloads/x'
}

/** A butlerd whose calls are answered by `answers`; a function answer can wait or fail */
function fakeButlerd(answers: Record<string, unknown>) {
  const off = jest.fn()
  const call = jest.fn((method: string, params: unknown) => {
    const answer = answers[method]
    return typeof answer === 'function'
      ? (answer as (p: unknown) => Promise<unknown>)(params)
      : Promise.resolve(answer)
  })
  const on = jest.fn(() => off)
  return { butlerd: { call, on } as unknown as Butlerd, call, on, off }
}

describe('runOperation', () => {
  test('queues, performs and returns what was queued, listening to the progress meanwhile', async () => {
    const { butlerd, call, on, off } = fakeButlerd({
      'Install.Queue': QUEUED,
      'Install.Perform': {}
    })
    const onProgress = jest.fn()

    const queued = await runOperation(
      butlerd,
      new AbortController().signal,
      { reason: 'install' },
      onProgress
    )

    expect(queued).toBe(QUEUED)
    expect(call).toHaveBeenNthCalledWith(1, 'Install.Queue', {
      reason: 'install'
    })
    expect(call).toHaveBeenNthCalledWith(2, 'Install.Perform', {
      id: 'op-1',
      stagingFolder: '/games/downloads/x'
    })
    expect(on).toHaveBeenCalledWith('Progress', onProgress)
    expect(off).toHaveBeenCalled()
  })

  test('an abort during the perform cancels the operation in butler and ends as aborted', async () => {
    const controller = new AbortController()
    const { butlerd, call, off } = fakeButlerd({
      'Install.Queue': QUEUED,
      // Butler ends the perform with an error when the cancel reaches it
      'Install.Perform': () =>
        new Promise((_resolve, reject) =>
          controller.signal.addEventListener('abort', () =>
            setTimeout(
              () => reject(new Error('The operation was cancelled.')),
              5
            )
          )
        ),
      'Install.Cancel': { didCancel: true }
    })

    const running = runOperation(butlerd, controller.signal, {}, jest.fn())
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()

    const error = await running.catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(OperationAborted)
    expect((error as OperationAborted).queued).toBe(QUEUED)
    expect(call).toHaveBeenCalledWith('Install.Cancel', { id: 'op-1' })
    expect(off).toHaveBeenCalled()
  })

  test('already aborted: nothing is queued', async () => {
    const controller = new AbortController()
    controller.abort()
    const { butlerd, call } = fakeButlerd({ 'Install.Queue': QUEUED })

    await expect(
      runOperation(butlerd, controller.signal, {}, jest.fn())
    ).rejects.toBeInstanceOf(OperationAborted)
    expect(call).not.toHaveBeenCalled()
  })

  test('aborted while it is being queued: it is not performed, and what was queued is told', async () => {
    const controller = new AbortController()
    const { butlerd, call } = fakeButlerd({
      'Install.Queue': async () => {
        controller.abort()
        return QUEUED
      }
    })

    const error = await runOperation(
      butlerd,
      controller.signal,
      {},
      jest.fn()
    ).catch((reason: unknown) => reason)

    expect((error as OperationAborted).queued).toBe(QUEUED)
    expect(call).not.toHaveBeenCalledWith('Install.Perform', expect.anything())
  })

  test('a real failure is not taken for an abort', async () => {
    const failure = new Error('disk full')
    const { butlerd } = fakeButlerd({
      'Install.Queue': QUEUED,
      'Install.Perform': () => Promise.reject(failure)
    })

    await expect(
      runOperation(butlerd, new AbortController().signal, {}, jest.fn())
    ).rejects.toBe(failure)
  })

  test('if butler cannot cancel, it is logged and the operation still ends as aborted', async () => {
    const controller = new AbortController()
    const { butlerd } = fakeButlerd({
      'Install.Queue': QUEUED,
      'Install.Perform': () =>
        new Promise((_resolve, reject) =>
          controller.signal.addEventListener('abort', () =>
            setTimeout(() => reject(new Error('stopped')), 5)
          )
        ),
      'Install.Cancel': () => Promise.reject(new Error('no such operation'))
    })

    const running = runOperation(butlerd, controller.signal, {}, jest.fn())
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()

    await expect(running).rejects.toBeInstanceOf(OperationAborted)
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(logError).toHaveBeenCalled()
  })
})

describe('inTurn', () => {
  test('runs one after the other, even when the first one fails', async () => {
    const order: string[] = []
    const first = inTurn(async () => {
      order.push('first starts')
      await new Promise((resolve) => setTimeout(resolve, 30))
      order.push('first ends')
      throw new Error('first failed')
    })
    const second = inTurn(async () => {
      order.push('second starts')
      return 2
    })

    await expect(first).rejects.toThrow('first failed')
    expect(await second).toBe(2)
    expect(order).toEqual(['first starts', 'first ends', 'second starts'])
  })
})

describe('discardPartialInstall', () => {
  const place = () => mkdtempSync(join(tmpdir(), 'itch-place-'))
  const make = (folder: string) => {
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'file'), 'x')
  }

  test('removes the folder of the install and the staging one, inside the place', () => {
    const dir = place()
    const queued = {
      ...QUEUED,
      installFolder: join(dir, 'game'),
      stagingFolder: join(dir, 'downloads', 'x')
    }
    make(queued.installFolder)
    make(queued.stagingFolder)

    discardPartialInstall(queued, dir)

    expect(existsSync(queued.installFolder)).toBe(false)
    expect(existsSync(queued.stagingFolder)).toBe(false)
    expect(existsSync(dir)).toBe(true)
  })

  test('never touches what is outside the place, nor the place itself', () => {
    const dir = place()
    const outside = place()
    make(outside)
    make(join(dir, 'kept'))

    discardPartialInstall(
      { ...QUEUED, installFolder: outside, stagingFolder: dir },
      dir
    )
    discardPartialInstall(
      {
        ...QUEUED,
        installFolder: join(dir, '..'),
        stagingFolder: `${dir}/../x`
      },
      dir
    )

    expect(existsSync(outside)).toBe(true)
    expect(existsSync(join(dir, 'kept'))).toBe(true)
  })

  test('does nothing when butler had made nothing', () => {
    expect(() => discardPartialInstall(undefined, '/games')).not.toThrow()
  })
})
