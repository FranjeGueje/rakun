const handlers = new Map<string, (...args: unknown[]) => unknown>()

jest.mock('backend/ipc', () => ({
  addHandler: (name: string, fn: (...args: unknown[]) => unknown) => {
    handlers.set(name, fn)
  }
}))

let settings: { steamGridDbApiKey?: string }

jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: () => ({
      getSettings: () => settings
    })
  }
}))

function call(name: string, ...args: unknown[]) {
  const handler = handlers.get(name)
  if (!handler) throw new Error(`no handler registered for ${name}`)
  return handler(...args)
}

beforeEach(() => {
  jest.resetModules()
  handlers.clear()
  settings = {}
  require('../ipc_handler')
})

describe('steamgriddb.hasApiKey', () => {
  test('false when nothing is stored', () => {
    expect(call('steamgriddb.hasApiKey')).toBe(false)
  })

  test('true for a stored plain-text key', () => {
    settings.steamGridDbApiKey = 'a-real-key'
    expect(call('steamgriddb.hasApiKey')).toBe(true)
  })
})
