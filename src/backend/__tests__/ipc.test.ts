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
    addHandler('getRelicVersion', () => '1.0.0')
    expect(hasHandler('getRelicVersion')).toBe(true)
    await expect(invokeHandler('getRelicVersion')).resolves.toBe('1.0.0')
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
    addListener('removeFromDMQueue', first)
    addListener('removeFromDMQueue', second)

    expect(dispatchListener('removeFromDMQueue', 'game')).toBe(true)
    expect(first).toHaveBeenCalledWith({}, 'game')
    expect(second).toHaveBeenCalledWith({}, 'game')
    expect(dispatchListener('unknown-channel')).toBe(false)
  })

  test('a one-time listener is called only once', () => {
    const listener = jest.fn()
    addOneTimeListener('pauseCurrentDownload', listener)

    dispatchListener('pauseCurrentDownload')
    dispatchListener('pauseCurrentDownload')

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
