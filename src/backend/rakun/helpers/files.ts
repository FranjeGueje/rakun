import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'fs'
import { dirname, join } from 'path'
import type { HelperInfo, HelperState } from 'common/rakun/helpers'
import {
  Arch,
  expectedFiles,
  HELPERS,
  HelperName,
  Layout,
  RELEASE_TAGS,
  Root
} from './manifest'

/** What `getHelpers` answers, with the helper as one of the known names */
export type HelperEntry = HelperInfo & { helper: HelperName }

export const TAGS_FILE = '.release_tags'

export const machineArch = (): Arch =>
  process.arch === 'arm64' ? 'arm64' : 'x64'

type Tags = Partial<Record<HelperName, string>>

/** What each helper was installed as (a missing or broken file says nothing) */
export function readTags(binRoot: string): Tags {
  try {
    return JSON.parse(readFileSync(join(binRoot, TAGS_FILE), 'utf-8')) as Tags
  } catch {
    return {}
  }
}

export function recordTag(binRoot: string, helper: HelperName, tag: string) {
  mkdirSync(binRoot, { recursive: true })
  const tags = { ...readTags(binRoot), [helper]: tag }
  writeFileSync(join(binRoot, TAGS_FILE), JSON.stringify(tags), 'utf-8')
}

/** The root a file of the tarball is in: Windows files only exist in the layout's win root */
const rootOf = (layout: Layout, root: Root) =>
  root === 'win' ? layout.winRoot : layout.binRoot

/**
 * What is installed. `bundleBinRoot` is the `public/bin` of a full tarball: its
 * Linux files and its tags count when the user's folder has none of them.
 */
export function helperStates(
  layout: Layout,
  {
    arch = machineArch(),
    bundleBinRoot
  }: { arch?: Arch; bundleBinRoot?: string } = {}
): HelperEntry[] {
  const own = readTags(layout.binRoot)
  const bundled = bundleBinRoot ? readTags(bundleBinRoot) : {}
  return HELPERS.map((helper) => {
    const present = expectedFiles(helper, arch).every(
      ({ root, file }) =>
        existsSync(join(rootOf(layout, root), file)) ||
        (root === 'bin' &&
          !!bundleBinRoot &&
          existsSync(join(bundleBinRoot, file)))
    )
    const installed = own[helper] ?? bundled[helper] ?? ''
    const pinned = RELEASE_TAGS[helper]
    // Zoom's script has no version in its address: whatever is there is the one
    // that is there, and it cannot be told apart from «the tested one»
    const state: HelperState = !present
      ? 'missing'
      : installed === pinned || helper === 'zoom-platform'
        ? 'ok'
        : 'other'
    return { helper, pinned, installed: present ? installed : '', state }
  })
}

/**
 * Full tarball: puts the Windows files it carries into the win root, when they
 * are not there or are of another version than the bundle's. What the user
 * downloaded is not touched while it is the version of the bundle.
 * @returns the helpers that were copied
 */
export function installFromBundle(
  layout: Layout,
  bundleBinRoot: string
): HelperName[] {
  const bundleWin = join(bundleBinRoot, 'x64', 'win32')
  const bundledTags = readTags(bundleBinRoot)
  const own = readTags(layout.binRoot)
  const copied: HelperName[] = []

  for (const helper of HELPERS) {
    const files = expectedFiles(helper, 'x64')
      .filter(({ root }) => root === 'win')
      .map(({ file }) => file)
    const tag = bundledTags[helper]
    if (!files.length || !tag) continue
    if (!files.every((file) => existsSync(join(bundleWin, file)))) continue
    const placed = files.every((file) => existsSync(join(layout.winRoot, file)))
    if (placed && own[helper] === tag) continue

    for (const file of files) {
      const target = join(layout.winRoot, file)
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(join(bundleWin, file), target)
    }
    recordTag(layout.binRoot, helper, tag)
    copied.push(helper)
  }
  return copied
}
