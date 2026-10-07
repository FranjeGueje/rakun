import type { KnowFixesInfo, Runner } from 'common/types'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { storeMap } from 'common/utils'
import { fixesPath } from 'backend/constants/paths'
import { logWarning } from 'backend/logger'

export function readKnownFixes(appName: string, runner: Runner) {
  const fixPath = join(fixesPath, `${appName}-${storeMap[runner]}.json`)

  if (!existsSync(fixPath)) return null

  try {
    const fixesContent = JSON.parse(
      readFileSync(fixPath).toString()
    ) as KnowFixesInfo

    return fixesContent
  } catch (error) {
    logWarning(`Known fixes could not be applied, ignoring.\n${String(error)}`)
    return null
  }
}
