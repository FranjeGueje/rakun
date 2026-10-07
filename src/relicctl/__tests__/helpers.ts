import type { Api, ApiEvent } from '../client'
import type { StoreInfo } from 'common/relic/stores'
import type { Ctx } from '../context'

export const STORES: StoreInfo[] = [
  { id: 'legendary', name: 'epic', label: 'Epic' },
  { id: 'gog', name: 'gog', label: 'GOG' },
  { id: 'nile', name: 'amazon', label: 'Amazon' },
  { id: 'zoom', name: 'zoom', label: 'Zoom' }
]

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
    stores: () => Promise.resolve(STORES),
    json,
    log: (line) => lines.push(line),
    ask: () => Promise.resolve('pasted')
  }
  return { ctx, calls, lines }
}

export const opts = { wait: true, installed: false }
