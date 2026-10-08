/** `ok`: the pinned version is there. `other`: another version is (for instance after `--latest`) */
export type HelperState = 'ok' | 'missing' | 'other'

/** One helper binary: legendary, gogdl, nile, comet, epic-integration, zoom-platform or umu */
export type HelperInfo = {
  helper: string
  /** The version rakun was tested with */
  pinned: string
  /** The one that is installed, if it is known */
  installed: string
  state: HelperState
}

/** The last `helpersProgress` line of an update: it is over (it says nothing else) */
export const HELPERS_DONE = 'done'

export type HelpersUpdate = {
  helpers: HelperInfo[]
  failures: { helper: string; error: string }[]
}
