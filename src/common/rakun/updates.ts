import type { Runner } from 'common/types'

/** An installed game whose store has a newer version */
export type UpdateableGame = {
  runner: Runner
  appName: string
}
