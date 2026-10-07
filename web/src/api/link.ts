import type { ConnectionState, RelicdEvent } from './channels'
import { parseSseBlock, splitBlocks } from './sse'

type Fetch = typeof fetch

/**
 * The event stream of relicd in a browser. `EventSource` cannot send the token
 * header, so it is read with `fetch`. It
 * reconnects on its own and says whether relicd answers.
 */
export class WebLink {
  private state: ConnectionState = 'connecting'
  private running = false
  private attempt = 0
  private readonly eventListeners = new Set<(event: RelicdEvent) => void>()
  private readonly stateListeners = new Set<(state: ConnectionState) => void>()

  constructor(
    private readonly token: string,
    private readonly fetchFn: Fetch = (input, init) => fetch(input, init),
    private readonly retryDelays = [1000, 2000, 5000],
    private readonly wait = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms))
  ) {}

  get connection(): ConnectionState {
    return this.state
  }

  onEvent(listener: (event: RelicdEvent) => void): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  onConnection(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  start(): void {
    if (this.running) return
    this.running = true
    void this.run()
  }

  stop(): void {
    this.running = false
  }

  private setState(state: ConnectionState): void {
    if (state === this.state) return
    this.state = state
    this.stateListeners.forEach((listener) => listener(state))
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        await this.follow()
      } catch {
        // relicd stopped or does not answer: the same as the stream ending
      }
      this.setState('offline')
      const last = this.retryDelays.length - 1
      await this.wait(this.retryDelays[Math.min(this.attempt, last)])
      this.attempt++
    }
  }

  /** Reads the stream until it ends */
  private async follow(): Promise<void> {
    const res = await this.fetchFn('/events', {
      headers: { 'x-relicd-token': this.token }
    })
    if (!res.ok || !res.body) return
    this.attempt = 0
    this.setState('online')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (this.running) {
      const { done, value } = await reader.read()
      if (done) return
      const { blocks, rest } = splitBlocks(
        buffer + decoder.decode(value, { stream: true })
      )
      buffer = rest
      blocks.forEach((block) => this.dispatch(block))
    }
    await reader.cancel()
  }

  private dispatch(block: string): void {
    let event: RelicdEvent | undefined
    try {
      event = parseSseBlock(block)
    } catch {
      return // a malformed block is not worth dropping the stream
    }
    if (event) this.eventListeners.forEach((listener) => listener(event))
  }
}
