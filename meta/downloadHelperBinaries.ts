/**
 * Fills `public/bin` with the helper binaries for the tarballs (the product
 * downloads the same ones with `rakunctl helpers update`): both architectures,
 * at the versions rakun was tested with. `RAKUN_CHECK=1` only compares those
 * versions with the latest ones.
 */
import { readFile } from 'fs/promises'
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

/** zoom-platform is not on GitHub: its version lives inside the script itself */
async function zoomScriptVersion(): Promise<string> {
  const script = await readFile(
    join(layout.binRoot, 'zoom', 'zoom-platform.sh'),
    'utf-8'
  ).catch(() => '')
  return /INSTALLER_VERSION="([^"]+)"/.exec(script)?.[1] ?? 'no file'
}

async function upstreamTag(helper: HelperName): Promise<string> {
  const repo = REPOS[helper]
  return repo ? latestTag(repo) : zoomScriptVersion()
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
