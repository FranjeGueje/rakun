import type { RelicdBridge } from './api/bridge'

declare global {
  interface Window {
    relicd: RelicdBridge
  }
}
