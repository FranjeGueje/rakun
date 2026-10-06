import type { Api, ApiEvent } from '../client'
import type { Ctx } from '../context'

export type Call = [string, unknown[]]

export function fakeCtx(
  replies: Record<string, unknown> = {},
  events: ApiEvent[] = [],
  json = false
) {
  const calls: Call[] = []
  const lines: string[] = []
  const api: Api = {
    health: () => Promise.resolve({ status: 'ok', version: '1.2.3' }),
    call: <T>(channel: string, ...args: unknown[]) => {
      calls.push([channel, args])
      return Promise.resolve(replies[channel] as T)
    },
    events: () =>
      Promise.resolve(
        (async function* () {
          yield* events
        })()
      )
  }
  const ctx: Ctx = {
    api,
    json,
    log: (line) => lines.push(line),
    ask: () => Promise.resolve('pasted')
  }
  return { ctx, calls, lines }
}

export const opts = { wait: true, installed: false }
