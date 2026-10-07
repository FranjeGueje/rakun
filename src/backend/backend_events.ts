import EventEmitter from 'events'

import type TypedEventEmitter from 'typed-emitter'
import type { GameStatus } from 'common/types'

type BackendEvents = {
  gameStatusUpdate: (payload: GameStatus) => void
  settingChanged: (obj: {
    key: string
    oldValue: unknown
    newValue: unknown
  }) => void
  [key: `progressUpdate-${string}`]: (progress: GameStatus) => void
}

// This can be used to emit/listen to events to decouple components
//
// Usage:
//   Emit events with `backendEvents.emit("eventName", arg1, arg2)
//   Listen to events with `backendEvents.on("eventName", (arg1, arg2) => { ... })
export const backendEvents =
  new EventEmitter() as TypedEventEmitter<BackendEvents>
