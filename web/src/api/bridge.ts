import type {
  CallChannel,
  CallMap,
  ConnectionState,
  RakunEvent
} from './channels'
import { WebLink } from './link'
import { errorOf } from './sse'
import type { LoginInfo, Runner, SettingKey } from './types'

/** How a login ended: the reason comes from rakun; `cancelled` when the person closed the login window */
export type LoginReply =
  { ok: true } | { ok: false; error: string; cancelled?: true }

/** How saving a setting ended: the reason comes from rakun, which validates it */
export type SettingReply = { ok: true } | { ok: false; error: string }

/** How starting rakun from the app ended */
export type StartReply = { ok: true } | { ok: false; error: string }

/**
 * Whether the app started rakun, and so closes it on exit: `cli` is the one `rakunctl`
 * started (it stays if it is busy); `embedded` is the one inside the app, which stops with it.
 */
export type Ownership = 'none' | 'cli' | 'embedded'

/**
 * What the interface uses to talk to rakun; the page keeps it as `window.rakun`. The first
 * five are always there. The rest tell what the host (the web, or a desktop app) can do,
 * and the interface only offers what is present.
 */
export type RakunBridge = {
  call: <C extends CallChannel>(
    channel: C,
    ...args: CallMap[C]['args']
  ) => Promise<CallMap[C]['result']>
  connection: () => Promise<ConnectionState>
  onEvent: (listener: (event: RakunEvent) => void) => () => void
  onConnection: (listener: (state: ConnectionState) => void) => () => void
  /** Saves one of the few settings the interface changes; rakun validates it */
  setSetting: (key: SettingKey, value: string) => Promise<SettingReply>
  /** The app's name: the header shows it next to the icon (without it, rakun's own lettering) */
  appName?: string
  /** A desktop app can be left: a Quit button, its key, and a dialog that says what happens to rakun */
  quit?: () => void
  owns?: () => Promise<Ownership>
  /** A desktop app can start rakun when it does not answer */
  start?: () => Promise<StartReply>
  /** The host opens the store's login page in a window and finishes the login itself */
  login?: (runner: Runner) => Promise<LoginReply>
  /**
   * Without `login` (a browser cannot watch the login page of a store), the person opens
   * the page and pastes the address it ends on, as `rakunctl login` does
   */
  loginPaste?: {
    info: (runner: Runner) => Promise<LoginInfo>
    submit: (runner: Runner, pasted: string) => Promise<LoginReply>
  }
}

type Post = (channel: string, args: unknown[]) => Promise<unknown>

const asText = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason)

/** `POST /api/<channel>`; an answer with an error becomes an exception with its reason */
export function poster(
  token: string,
  fetchFn: typeof fetch = (input, init) => fetch(input, init)
): Post {
  return async (channel, args) => {
    const res = await fetchFn(`/api/${channel}`, {
      method: 'POST',
      headers: { 'x-rakun-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ args })
    })
    const text = await res.text()
    if (!res.ok) throw new Error(errorOf(res.status, text))
    return (JSON.parse(text) as { result: unknown }).result
  }
}

async function reply(attempt: () => Promise<unknown>): Promise<SettingReply> {
  try {
    await attempt()
    return { ok: true }
  } catch (reason) {
    return { ok: false, error: asText(reason) }
  }
}

/** The bridge to rakun: its own API with the token its page came with */
export function createBridge(link: WebLink, post: Post): RakunBridge {
  return {
    call: ((channel: string, ...args: unknown[]) =>
      post(channel, args)) as RakunBridge['call'],
    connection: () => Promise.resolve(link.connection),
    onEvent: (listener) => link.onEvent(listener),
    onConnection: (listener) => link.onConnection(listener),
    setSetting: (key, value) =>
      reply(() => post('setSetting', [{ key, value }])),
    loginPaste: {
      info: (runner) => post('getLoginInfo', [runner]) as Promise<LoginInfo>,
      submit: async (runner, pasted) => {
        try {
          const result = (await post('submitLogin', [runner, pasted])) as {
            ok: boolean
            error?: string
          }
          return result.ok
            ? { ok: true }
            : { ok: false, error: result.error ?? 'login rejected' }
        } catch (reason) {
          return { ok: false, error: asText(reason) }
        }
      }
    }
  }
}
