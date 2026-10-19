import { DMQueueElement } from 'common/types'

const store: Record<string, unknown> = {}
jest.mock('backend/typed_store', () => ({
  TypeCheckedStoreBackend: jest.fn().mockImplementation(() => ({
    get: (key: string, def: unknown) => store[key] ?? def,
    set: (key: string, value: unknown) => {
      store[key] = value
    },
    has: (key: string) => key in store,
    delete: (key: string) => {
      delete store[key]
    }
  }))
}))
jest.mock('backend/storeManagers', () => ({ libraryManagerMap: {} }))
jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { DownloadManager: 'DownloadManager' }
}))
jest.mock('backend/utils', () => ({
  getFileSize: jest.fn(),
  removeFolder: jest.fn(),
  sendGameStatusUpdate: jest.fn()
}))
jest.mock('backend/ipc', () => ({ sendFrontendMessage: jest.fn() }))
jest.mock('backend/utils/aborthandler/aborthandler', () => ({
  callAbortController: jest.fn()
}))
jest.mock('backend/online_monitor', () => ({ onConnectivityChange: jest.fn() }))
jest.mock('backend/downloadmanager/utils', () => ({
  installQueueElement: jest.fn(),
  updateQueueElement: jest.fn()
}))

import { libraryManagerMap } from 'backend/storeManagers'
import { removeFolder } from 'backend/utils'
import {
  cancelCurrentDownload,
  clearFinished,
  initQueue,
  pauseCurrentDownload,
  removeFromQueue,
  resumeCurrentDownload
} from '../downloadqueue'
import { installQueueElement } from '../utils'

type Outcome = { status: 'done' | 'abort' | 'error' }
type Deferred = { promise: Promise<Outcome>; settle: (o: Outcome) => void }
const deferred = (): Deferred => {
  let settle: (o: Outcome) => void = () => undefined
  const promise = new Promise<Outcome>((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}
const flush = () => new Promise((resolve) => setImmediate(resolve))

const element = {
  type: 'install',
  params: { appName: 'game', runner: 'zoom' }
} as unknown as DMQueueElement

describe('initQueue', () => {
  test('a second call while the queue is running does not process the same element twice', async () => {
    store['queue'] = [element]
    let finish: (value: { status: 'done' }) => void = () => undefined
    jest.mocked(installQueueElement).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )

    const first = initQueue()
    const second = initQueue()
    finish({ status: 'done' })
    await Promise.all([first, second])

    expect(installQueueElement).toHaveBeenCalledTimes(1)
  })

  test('the reason an install failed is kept in the finished list', async () => {
    store['queue'] = [{ ...element }]
    store['finished'] = []
    jest
      .mocked(installQueueElement)
      .mockResolvedValue({ status: 'error', error: 'rakun has no screen' })

    await initQueue()

    expect(store['finished']).toEqual([
      expect.objectContaining({
        status: 'error',
        error: 'rakun has no screen'
      })
    ])
  })
})

describe('clearFinished', () => {
  test('empties the finished list and keeps the queue', () => {
    store['finished'] = [element]
    store['queue'] = [element]
    clearFinished()
    expect(store['finished']).toEqual([])
    expect(store['queue']).toEqual([element])
  })
})

describe('pause and resume', () => {
  beforeEach(() => {
    store['queue'] = [{ ...element }]
    store['finished'] = []
    jest.mocked(installQueueElement).mockReset()
    jest.mocked(removeFolder).mockReset()
    ;(libraryManagerMap as Record<string, unknown>)['zoom'] = {
      getGame: () => ({
        stop: jest.fn(),
        getGameInfo: () => ({ folder_name: 'Game' })
      })
    }
  })

  test('a pause keeps the element, and a quick resume installs it once more, not twice at once', async () => {
    const first = deferred()
    const second = deferred()
    jest
      .mocked(installQueueElement)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    const running = initQueue()
    await flush()
    pauseCurrentDownload()
    // Resumed before the first loop has seen its abort
    resumeCurrentDownload()
    await flush()
    expect(installQueueElement).toHaveBeenCalledTimes(1)

    first.settle({ status: 'abort' })
    await flush()
    expect(installQueueElement).toHaveBeenCalledTimes(2)
    expect(store['queue']).toHaveLength(1)

    second.settle({ status: 'done' })
    await running
    await flush()
    expect(store['queue']).toEqual([])
    expect(store['finished']).toEqual([
      expect.objectContaining({ status: 'done' })
    ])
  })

  test('a pause that arrives as the install finishes leaves it done, not queued again', async () => {
    const install = deferred()
    jest.mocked(installQueueElement).mockReturnValue(install.promise)

    const running = initQueue()
    await flush()
    pauseCurrentDownload()
    install.settle({ status: 'done' })
    await running

    expect(store['queue']).toEqual([])
    expect(store['finished']).toEqual([
      expect.objectContaining({ status: 'done' })
    ])
  })

  test('cancelling with nothing running does not delete the game that finished last', async () => {
    jest.mocked(installQueueElement).mockResolvedValue({ status: 'done' })
    await initQueue()

    cancelCurrentDownload({ removeDownloaded: true })
    pauseCurrentDownload()

    expect(removeFolder).not.toHaveBeenCalled()
  })
})

describe('removeFromQueue', () => {
  const queued = (runner: string) =>
    ({
      type: 'install',
      params: { appName: '123', runner }
    }) as unknown as DMQueueElement

  test('with the runner it removes the game of that store, not one of another with the same id', () => {
    store['queue'] = [queued('itch'), queued('zoom')]

    removeFromQueue('123', 'zoom')

    expect(
      (store['queue'] as DMQueueElement[]).map((el) => el.params.runner)
    ).toEqual(['itch'])
  })

  test('without it, the first with that id (as clients that do not say the store)', () => {
    store['queue'] = [queued('itch'), queued('zoom')]

    removeFromQueue('123')

    expect(
      (store['queue'] as DMQueueElement[]).map((el) => el.params.runner)
    ).toEqual(['zoom'])
  })
})
