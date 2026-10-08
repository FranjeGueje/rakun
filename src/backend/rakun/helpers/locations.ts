import { existsSync } from 'fs'
import { join } from 'path'
import {
  publicDir,
  rakunBinPath,
  rakunMountPath
} from 'backend/constants/paths'
import { logInfo, logWarning } from 'backend/logger'
import { helperStates, installFromBundle, type HelperEntry } from './files'
import type { Layout } from './manifest'

const LOG_PREFIX = 'Rakun'

/** Where the helpers go in the product: the tools in the user's folder, the Windows files in the mount */
export const helpersLayout = (): Layout => ({
  binRoot: rakunBinPath,
  winRoot: join(rakunMountPath, 'bin')
})

/** `public/bin` of a full tarball (there is none in a normal one) */
export const bundleBinRoot = () => join(publicDir, 'bin')

/**
 * A file of the helpers: the one that was downloaded, or else the one in the
 * tarball. If there is neither, where it would be downloaded to.
 */
export function helperFile(relative: string): string {
  const downloaded = join(rakunBinPath, relative)
  if (existsSync(downloaded)) return downloaded
  const bundled = join(bundleBinRoot(), relative)
  return existsSync(bundled) ? bundled : downloaded
}

export const helperExists = (relative: string): boolean =>
  existsSync(helperFile(relative))

export const currentHelpers = (): HelperEntry[] =>
  helperStates(helpersLayout(), { bundleBinRoot: bundleBinRoot() })

export const missingHelpers = (): string[] =>
  currentHelpers()
    .filter(({ state }) => state === 'missing')
    .map(({ helper }) => helper)

export const HELPERS_HINT = 'Run: rakunctl helpers update'

/** At start: what a full tarball carries goes where it is used, and what is still missing is said */
export function checkHelpersAtStart(): void {
  const copied = installFromBundle(helpersLayout(), bundleBinRoot())
  if (copied.length)
    logInfo(
      `Helpers installed from the tarball: ${copied.join(', ')}`,
      LOG_PREFIX
    )

  const missing = missingHelpers()
  if (missing.length)
    logWarning(
      `Helper binaries missing: ${missing.join(', ')}. ${HELPERS_HINT}`,
      LOG_PREFIX
    )
}
