import {
  addHandler,
  addListener,
  addOneTimeListener,
  dispatchListener,
  hasHandler,
  invokeHandler,
  onFrontendMessage,
  sendFrontendMessage
} from '../ipc'

describe('ipc registry', () => {
  test('invokeHandler calls the handler with the arguments and returns its result', async () => {
    addHandler('getMaxCpus', () => 4)
    expect(hasHandler('getMaxCpus')).toBe(true)
    await expect(invokeHandler('getMaxCpus')).resolves.toBe(4)
  })

  test('invokeHandler rejects for a channel without handler', async () => {
    expect(hasHandler('nope')).toBe(false)
    await expect(invokeHandler('nope')).rejects.toThrow(
      'No handler registered for "nope"'
    )
  })

  test('dispatchListener calls every listener and tells whether there was any', () => {
    const first = jest.fn()
    const second = jest.fn()
    addListener('openExternalUrl', first)
    addListener('openExternalUrl', second)

    expect(dispatchListener('openExternalUrl', 'https://a')).toBe(true)
    expect(first).toHaveBeenCalledWith({}, 'https://a')
    expect(second).toHaveBeenCalledWith({}, 'https://a')
    expect(dispatchListener('unknown-channel')).toBe(false)
  })

  test('a one-time listener is called only once', () => {
    const listener = jest.fn()
    addOneTimeListener('frontendReady', listener)

    dispatchListener('frontendReady')
    dispatchListener('frontendReady')

    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('sendFrontendMessage reaches every subscriber until it unsubscribes', () => {
    expect(sendFrontendMessage('refreshLibrary')).toBe(false)

    const received: unknown[] = []
    const unsubscribe = onFrontendMessage((channel, args) =>
      received.push([channel, args])
    )
    expect(sendFrontendMessage('refreshLibrary', 'gog')).toBe(true)
    unsubscribe()
    expect(sendFrontendMessage('refreshLibrary')).toBe(false)

    expect(received).toEqual([['refreshLibrary', ['gog']]])
  })
})
