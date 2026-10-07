import type { LogPrefix } from './constants'

interface FullLogOptions {
  prefix?: LogPrefix
  forceLog?: boolean
}
type LogOptions = FullLogOptions | LogPrefix

export type { LogOptions }
