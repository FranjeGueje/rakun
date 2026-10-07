import type { RakunBridge } from './api/bridge'

declare global {
  interface Window {
    rakun: RakunBridge
  }
}
