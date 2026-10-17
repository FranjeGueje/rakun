/**
 * Fills `public/bin` with the helper binaries for the tarballs (the product
 * downloads the same ones with `rakunctl helpers update`): both architectures,
 * at the versions rakun was tested with. `RAKUN_CHECK=1` only compares those
 * versions with the latest ones.
 */
import { join } from 'path'
import {
  downloadHelpers,
  latestTag
} from '../src/backend/rakun/helpers/download'
import { helperStates } from '../src/backend/rakun/helpers/files'
import {
  HELPERS,
  REPOS,
  RELEASE_TAGS,
  type Arch,
  type HelperName,
  type Layout
} from '../src/backend/rakun/helpers/manifest'

const ARCHES: Arch[] = ['x64', 'arm64']

// The source tree keeps everything under public/bin
const layout: Layout = {
  binRoot: join('public', 'bin'),
  winRoot: join('public', 'bin', 'x64', 'win32')
}

/** butler is not on GitHub: itch's server says which is the latest one */
async function butlerLatest(): Promise<string> {
  const response = await fetch(
    'https://broth.itch.zone/butler/linux-amd64/LATEST'
  )
  if (!response.ok) throw new Error(`HTTP ${response.status} (broth.itch.zone)`)
  return (await response.text()).trim()
}

async function upstreamTag(helper: HelperName): Promise<string> {
  if (helper === 'butler') return butlerLatest()
  const repo = REPOS[helper]
  if (!repo) throw new Error(`No repository for ${helper}`)
  return latestTag(repo)
}

/** Read-only: compares each pinned tag with the latest upstream one */
async function versionCheck() {
  const rows = await Promise.all(
    HELPERS.map(async (helper) => {
      const pin = RELEASE_TAGS[helper]
      const upstream = await upstreamTag(helper).catch(
        (error: unknown) => `ERROR (${String(error)})`
      )
      return {
        helper,
        pin,
        upstream,
        status: upstream === pin ? 'OK' : 'OUTDATED'
      }
    })
  )
  console.table(rows)
}

async function download() {
  const missing = HELPERS.filter((helper) =>
    ARCHES.some(
      (arch) =>
        helperStates(layout, { arch }).find((s) => s.helper === helper)
          ?.state !== 'ok'
    )
  )
  if (!missing.length) {
    console.log('Nothing to download, binaries are up-to-date')
    return
  }
  console.log('Downloading:', missing)
  const failures = await downloadHelpers(layout, {
    arches: ARCHES,
    only: missing,
    onProgress: (line) => console.log(line)
  })
  if (failures.length) {
    console.error(
      'Failed:',
      failures.map(({ helper, error }) => `${helper}: ${error}`)
    )
    process.exitCode = 1
  }
}

void (process.env['RAKUN_CHECK'] === '1' ? versionCheck() : download())
