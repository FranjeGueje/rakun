/** @jest-environment node */
import type { ConnectionState, RakunEvent } from '../channels'
import { WebLink } from '../link'

/** A response whose body arrives in the given pieces and then ends */
function streamOf(pieces: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      pieces.forEach((piece) => controller.enqueue(encoder.encode(piece)))
      controller.close()
    }
  })
  return new Response(body, { status: 200 })
}

/** Runs the link against the answers given, one per attempt, and stops after the last */
async function runLink(answers: (Response | Error)[]) {
  const states: ConnectionState[] = []
  const events: RakunEvent[] = []
  const waits: number[] = []
  const requests: { url: string; token: string | undefined }[] = []
  let attempt = 0
  let link: WebLink
  const fetchFn = ((url: string, init?: RequestInit) => {
    requests.push({
      url,
      token: (init?.headers as Record<string, string>)['x-rakun-token']
    })
    const answer = answers[attempt++]
    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(answer)
  }) as typeof fetch
  const done = new Promise<void>((resolve) => {
    link = new WebLink('tok', fetchFn, [1000, 2000, 5000], (ms) => {
      waits.push(ms)
      if (attempt >= answers.length) {
        link.stop()
        resolve()
      }
      return Promise.resolve()
    })
    link.onConnection((state) => states.push(state))
    link.onEvent((event) => events.push(event))
    link.start()
  })
  await done
  return { states, events, waits, requests }
}

describe('WebLink', () => {
  test('asks for /events with the token and reads events split across pieces', async () => {
    const { events, requests } = await runLink([
      streamOf([
        ': connected\n\nevent: refreshLibrary\nda',
        'ta: ["gog"]\n\n: ping\n\nevent: progressUpdate\ndata: [{"a":1}]\n\n'
      ])
    ])
    expect(requests).toEqual([{ url: '/events', token: 'tok' }])
    expect(events).toEqual([
      { event: 'refreshLibrary', args: ['gog'] },
      { event: 'progressUpdate', args: [{ a: 1 }] }
    ])
  })

  test('is online while the stream lasts and offline when it ends', async () => {
    const { states } = await runLink([streamOf([': connected\n\n'])])
    expect(states).toEqual(['online', 'offline'])
  })

  test('retries after 1 s, 2 s and then every 5 s, and comes back online', async () => {
    const down = new Error('Failed to fetch')
    const { states, waits } = await runLink([
      down,
      new Response('nope', { status: 401 }),
      down,
      down,
      streamOf([': connected\n\n'])
    ])
    expect(waits.slice(0, 4)).toEqual([1000, 2000, 5000, 5000])
    expect(states).toEqual(['offline', 'online', 'offline'])
  })

  test('an event with a malformed body does not drop the stream', async () => {
    const { events } = await runLink([
      streamOf([
        'event: refreshLibrary\ndata: {broken\n\nevent: refreshLibrary\ndata: ["epic"]\n\n'
      ])
    ])
    expect(events).toEqual([{ event: 'refreshLibrary', args: ['epic'] }])
  })
})
