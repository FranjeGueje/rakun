import type { Api, ApiEvent } from '../client'
import type { StoreInfo } from 'common/rakun/stores'
import type { Ctx } from '../context'

const UPPER = {
  import: true,
  update: true,
  repair: true,
  lowercasePlatform: false,
  directLaunch: false
}
const LOWER = { ...UPPER, lowercasePlatform: true }

export const STORES: StoreInfo[] = [
  { id: 'legendary', name: 'epic', label: 'Epic', caps: UPPER },
  { id: 'gog', name: 'gog', label: 'GOG', caps: LOWER },
  { id: 'nile', name: 'amazon', label: 'Amazon', caps: UPPER },
  {
    id: 'zoom',
    name: 'zoom',
    label: 'Zoom',
    caps: {
      ...LOWER,
      import: false,
      update: false,
      repair: false,
      directLaunch: true
    }
  }
]

export type Call = [string, unknown[]]

export function fakeCtx(
  replies: Record<string, unknown> = {},
  events: ApiEvent[] = [],
  json = false,
  web?: string
) {
  const calls: Call[] = []
  const lines: string[] = []
  const api: Api = {
    port: 17370,
    health: () => Promise.resolve({ status: 'ok', version: '1.2.3', web }),
    call: <T>(channel: string, ...args: unknown[]) => {
      calls.push([channel, args])
      const reply = replies[channel]
      // A function answers according to the arguments of the call
      return Promise.resolve(
        (typeof reply === 'function' ? reply(...args) : reply) as T
      )
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
