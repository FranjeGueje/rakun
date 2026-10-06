import { onFrontendMessage } from 'backend/ipc'
import { libraryManagerMap } from 'backend/storeManagers'
import { refreshRunner, refreshingRunners, startRefresh } from '../refresh'

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))
jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    gog: { refresh: jest.fn() },
    legendary: { refresh: jest.fn() },
    nile: { refresh: jest.fn() },
    zoom: { refresh: jest.fn() }
  }
}))

const refresh = (runner: keyof typeof libraryManagerMap) =>
  jest.mocked(libraryManagerMap[runner].refresh)

function deferred() {
  let resolve: () => void = () => undefined
  const promise = new Promise<never>((res) => {
    resolve = () => res(null as never)
  })
  return { promise, resolve }
}

describe('library refresh', () => {
  test('a second request while refreshing joins the first', async () => {
    const gate = deferred()
    refresh('gog').mockReturnValue(gate.promise)

    const first = refreshRunner('gog')
    const second = refreshRunner('gog')

    expect(second).toBe(first)
    expect(refresh('gog')).toHaveBeenCalledTimes(1)
    expect(refreshingRunners()).toEqual(['gog'])

    gate.resolve()
    await first
    expect(refreshingRunners()).toEqual([])

    refresh('gog').mockResolvedValue(null as never)
    await refreshRunner('gog')
    expect(refresh('gog')).toHaveBeenCalledTimes(2)
  })

  test('publishes refreshLibrary with the store when it ends, even on failure', async () => {
    refresh('nile').mockRejectedValue(new Error('offline'))
    const events: unknown[] = []
    const unsubscribe = onFrontendMessage((channel, args) =>
      events.push([channel, args])
    )

    await refreshRunner('nile')
    unsubscribe()

    expect(events).toEqual([['refreshLibrary', ['nile']]])
  })

  test('startRefresh returns at once and "all" covers every store', async () => {
    const gates = ['gog', 'legendary', 'nile', 'zoom'].map((runner) => {
      const gate = deferred()
      refresh(runner as 'gog').mockReturnValue(gate.promise)
      return gate
    })

    expect(startRefresh()).toBeUndefined()
    expect(refreshingRunners().sort()).toEqual([
      'gog',
      'legendary',
      'nile',
      'zoom'
    ])

    gates.forEach((gate) => gate.resolve())
    await Promise.resolve()
  })
})
