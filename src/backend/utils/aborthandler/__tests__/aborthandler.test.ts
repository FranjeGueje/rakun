import {
  callAbortController,
  callAllAbortControllers,
  createAbortController,
  deleteAbortController
} from '../aborthandler'

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

describe('callAllAbortControllers', () => {
  test('aborts every process that is still running, and only those', () => {
    const one = createAbortController('one')
    const two = createAbortController('two')
    const finished = createAbortController('finished')
    deleteAbortController('finished')

    callAllAbortControllers()

    expect(one.signal.aborted).toBe(true)
    expect(two.signal.aborted).toBe(true)
    expect(finished.signal.aborted).toBe(false)
    deleteAbortController('one')
    deleteAbortController('two')
  })

  test('with nothing running it does nothing', () => {
    expect(() => callAllAbortControllers()).not.toThrow()
  })
})

describe('callAbortController', () => {
  test('aborts the one with that id', () => {
    const controller = createAbortController('game')

    callAbortController('game')

    expect(controller.signal.aborted).toBe(true)
    deleteAbortController('game')
  })
})
