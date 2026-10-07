import type { CallMap, ConnectionState, RakunEvent } from '../api/channels'
import type { LoginReply, RakunBridge, SettingReply } from '../api/bridge'
import type { AppSettings, GameInfo, LoginInfo, QueueInfo } from '../api/types'

export const settings = (extra: Partial<AppSettings> = {}): AppSettings => ({
  language: 'es',
  defaultInstallPath: '/juegos',
  protonPath: '',
  steamGridDbApiKey: '',
  ...extra
})

export const game = (
  app_name: string,
  extra: Partial<GameInfo> = {}
): GameInfo => ({
  runner: 'gog',
  app_name,
  title: app_name,
  art_cover: '',
  art_square: '',
  is_installed: false,
  install: {},
  ...extra
})

type Calls = {
  [C in keyof CallMap]?:
    | CallMap[C]['result']
    | ((...args: CallMap[C]['args']) => CallMap[C]['result'])
}

/** A rakun stand-in: answers what it is told to, records the calls, and emits on demand */
export function fakeRakun(
  answers: Calls = {},
  options: {
    /** How a pasted login ends (by default, well) */
    login?: LoginReply
    setting?: SettingReply
    /** Called when a setting is saved with success, so the next read sees it */
    onSetting?: (key: string, value: string) => void
  } = {}
) {
  const eventListeners = new Set<(event: RakunEvent) => void>()
  const connectionListeners = new Set<(state: ConnectionState) => void>()
  let connection: ConnectionState = 'online'
  const calls: [string, unknown[]][] = []

  const call = jest.fn((channel: string, ...args: unknown[]) => {
    calls.push([channel, args])
    const answer = answers[channel as keyof CallMap]
    const value =
      typeof answer === 'function'
        ? (answer as (...a: unknown[]) => unknown)(...args)
        : answer
    return Promise.resolve(value ?? null)
  })
  const loginInfo: LoginInfo = {
    runner: 'gog',
    url: 'https://login.example/gog',
    instructions: 'Log in to GOG.'
  }
  const login = {
    info: jest.fn(() => Promise.resolve(loginInfo)),
    submit: jest.fn<Promise<LoginReply>, [string, string]>(() =>
      Promise.resolve(options.login ?? { ok: true })
    )
  }
  const setSetting = jest.fn((key: string, value: string) => {
    const reply = options.setting ?? { ok: true }
    if (reply.ok) options.onSetting?.(key, value)
    return Promise.resolve<SettingReply>(reply)
  })

  const bridge = {
    call,
    login,
    setSetting,
    connection: () => Promise.resolve(connection),
    onEvent: (listener: (event: RakunEvent) => void) => {
      eventListeners.add(listener)
      return () => eventListeners.delete(listener)
    },
    onConnection: (listener: (state: ConnectionState) => void) => {
      connectionListeners.add(listener)
      return () => connectionListeners.delete(listener)
    }
  } as unknown as RakunBridge

  return {
    bridge,
    calls,
    login,
    setSetting,
    emit: (event: RakunEvent) => eventListeners.forEach((l) => l(event)),
    setConnection: (state: ConnectionState) => {
      connection = state
      connectionListeners.forEach((l) => l(state))
    },
    called: (channel: string) => calls.filter(([name]) => name === channel)
  }
}

export const emptyQueue: QueueInfo = {
  elements: [],
  finished: [],
  state: 'idle'
}
