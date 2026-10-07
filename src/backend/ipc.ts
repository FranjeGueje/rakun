import type {
  AsyncIPCFunctions,
  SyncIPCFunctions,
  FrontendMessages
} from 'common/types/ipc'

// Transport-agnostic replacement for Electron's ipcMain: handlers and listeners
// live in plain registries, and whoever serves the API (the HTTP server)
// calls `invokeHandler` / `dispatchListener` and subscribes to the events
// with `onFrontendMessage`. The first handler argument is kept for source
// compatibility with the old `(e, ...args)` signature; it is always empty.
type IpcEvent = Record<never, never>

type Handler = (e: IpcEvent, ...args: never[]) => unknown
type Listener = (e: IpcEvent, ...args: never[]) => void
type FrontendMessageSubscriber = (channel: string, args: unknown[]) => void

const handlers = new Map<string, Handler>()
const listeners = new Map<string, Listener[]>()
const subscribers = new Set<FrontendMessageSubscriber>()

const noEvent: IpcEvent = {}

function addListener<ChannelName extends keyof SyncIPCFunctions>(
  channel: ChannelName,
  listener: (
    e: IpcEvent,
    ...args: Parameters<SyncIPCFunctions[ChannelName]>
  ) => void
) {
  listeners.set(channel, [
    ...(listeners.get(channel) ?? []),
    listener as Listener
  ])
}

function addOneTimeListener<ChannelName extends keyof SyncIPCFunctions>(
  channel: ChannelName,
  listener: (
    e: IpcEvent,
    ...args: Parameters<SyncIPCFunctions[ChannelName]>
  ) => void
) {
  const once: Listener = (e, ...args) => {
    listeners.set(
      channel,
      (listeners.get(channel) ?? []).filter((l) => l !== once)
    )
    ;(listener as Listener)(e, ...args)
  }
  listeners.set(channel, [...(listeners.get(channel) ?? []), once])
}

function addHandler<ChannelName extends keyof AsyncIPCFunctions>(
  channel: ChannelName,
  handler: (
    e: IpcEvent,
    ...args: Parameters<AsyncIPCFunctions[ChannelName]>
  ) =>
    | ReturnType<AsyncIPCFunctions[ChannelName]>
    | Awaited<ReturnType<AsyncIPCFunctions[ChannelName]>>
) {
  handlers.set(channel, handler as Handler)
}

/** Calls the handler registered with `addHandler`, as `ipcRenderer.invoke` did */
async function invokeHandler(
  channel: string,
  ...args: unknown[]
): Promise<unknown> {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No handler registered for "${channel}"`)
  return handler(noEvent, ...(args as never[]))
}

/** Calls the listeners registered with `addListener`, as `ipcRenderer.send` did */
function dispatchListener(channel: string, ...args: unknown[]): boolean {
  const registered = listeners.get(channel)
  if (!registered?.length) return false
  for (const listener of [...registered])
    listener(noEvent, ...(args as never[]))
  return true
}

function hasHandler(channel: string): boolean {
  return handlers.has(channel)
}

/** Subscribes to every message sent with `sendFrontendMessage` */
function onFrontendMessage(subscriber: FrontendMessageSubscriber): () => void {
  subscribers.add(subscriber)
  return () => subscribers.delete(subscriber)
}

/**
 * Publishes a message to every subscriber
 * @returns Whether anyone received it
 */
function sendFrontendMessage<ChannelName extends keyof FrontendMessages>(
  channel: ChannelName,
  ...args: Parameters<FrontendMessages[ChannelName]>
): boolean {
  if (!subscribers.size) return false
  for (const subscriber of subscribers) subscriber(channel, args)
  return true
}

export {
  addListener,
  addOneTimeListener,
  addHandler,
  invokeHandler,
  dispatchListener,
  hasHandler,
  onFrontendMessage,
  sendFrontendMessage
}
