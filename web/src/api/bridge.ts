import type {
  CallChannel,
  CallMap,
  ConnectionState,
  RelicdEvent
} from './channels'
import { WebLink } from './link'
import { errorOf } from './sse'
import type { LoginInfo, Runner, SettingKey } from './types'

/** How a login ended: the reason comes from relicd */
export type LoginReply = { ok: true } | { ok: false; error: string }

/** How saving a setting ended: the reason comes from relicd, which validates it */
export type SettingReply = { ok: true } | { ok: false; error: string }

/** What the interface uses to talk to relicd; the page keeps it as `window.relicd` */
export type RelicdBridge = {
  call: <C extends CallChannel>(
    channel: C,
    ...args: CallMap[C]['args']
  ) => Promise<CallMap[C]['result']>
  connection: () => Promise<ConnectionState>
  onEvent: (listener: (event: RelicdEvent) => void) => () => void
  onConnection: (listener: (state: ConnectionState) => void) => () => void
  /** Saves one of the few settings the interface changes; relicd validates it */
  setSetting: (key: SettingKey, value: string) => Promise<SettingReply>
  /**
   * A browser cannot watch the login page of a store, so the person opens it
   * and pastes the address it ends on (as `relicctl login` does)
   */
  login: {
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
      headers: { 'x-relicd-token': token, 'content-type': 'application/json' },
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

/** The bridge to relicd: its own API with the token its page came with */
export function createBridge(link: WebLink, post: Post): RelicdBridge {
  return {
    call: ((channel: string, ...args: unknown[]) =>
      post(channel, args)) as RelicdBridge['call'],
    connection: () => Promise.resolve(link.connection),
    onEvent: (listener) => link.onEvent(listener),
    onConnection: (listener) => link.onConnection(listener),
    setSetting: (key, value) =>
      reply(() => post('setSetting', [{ key, value }])),
    login: {
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
