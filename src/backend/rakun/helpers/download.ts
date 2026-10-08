import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { recordTag, helperStates, machineArch } from './files'
import {
  Arch,
  Asset,
  assetsOf,
  HELPERS,
  HelperName,
  Layout,
  RELEASE_TAGS,
  releaseUrl,
  REPOS,
  ZOOM_SCRIPT_URL
} from './manifest'

const USER_AGENT = 'RakunBinaryUpdater/1.0'

export type DownloadOptions = {
  /** The latest release of each helper instead of the version rakun was tested with: nothing is checked */
  latest?: boolean
  /** The architectures whose tools are downloaded (the Windows ones are always x64) */
  arches?: Arch[]
  /** By default, the ones that are missing or not at the pinned version (all of them with `latest`) */
  only?: HelperName[]
  onProgress?: (line: string) => void
  /** To test without the network */
  fetchFn?: typeof fetch
}

async function getBuffer(fetchFn: typeof fetch, url: string): Promise<Buffer> {
  const response = await fetchFn(url, { headers: { 'User-Agent': USER_AGENT } })
  if (response.status !== 200)
    throw new Error(`Failed to download ${url}: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

/** The tag of the latest release of a GitHub repo */
export async function latestTag(
  repo: string,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const response = await fetchFn(
    `https://api.github.com/repos/${repo}/releases/latest`,
    {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/vnd.github+json'
      }
    }
  )
  if (!response.ok) throw new Error(`HTTP ${response.status} (${repo})`)
  const body = (await response.json()) as { tag_name?: string }
  if (!body.tag_name) throw new Error(`No tag_name in the answer for ${repo}`)
  return body.tag_name
}

export const sha256Of = (data: Buffer) =>
  createHash('sha256').update(data).digest('hex')

/** Writes next to the target and renames, so that a cut download leaves nothing half done */
function writeAtomic(target: string, data: Buffer, mode?: number) {
  mkdirSync(dirname(target), { recursive: true })
  const part = `${target}.part`
  writeFileSync(part, data)
  if (mode) chmodSync(part, mode)
  renameSync(part, target)
}

/** unzip and tar are run with no shell: the names are ours, but there is no need to trust that */
function unpack(kind: 'zip' | 'tar', data: Buffer, into: string) {
  const dir = mkdtempSync(join(tmpdir(), 'rakun-helper-'))
  const archive = join(dir, `archive.${kind}`)
  try {
    writeFileSync(archive, data)
    mkdirSync(into, { recursive: true })
    if (kind === 'zip') execFileSync('unzip', ['-o', '-q', archive, '-d', into])
    else execFileSync('tar', ['-xf', archive, '-C', into])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function installAsset(
  layout: Layout,
  helper: HelperName,
  asset: Asset,
  tag: string,
  verify: boolean,
  fetchFn: typeof fetch
) {
  const url = releaseUrl(helper, tag, asset)
  const data = await getBuffer(fetchFn, url)
  if (verify && asset.sha256 && sha256Of(data) !== asset.sha256)
    throw new Error(
      `The sha256 of ${url} is not the expected one: not installed`
    )

  const root = asset.root === 'win' ? layout.winRoot : layout.binRoot
  if (asset.kind === 'file' && asset.target) {
    // The Windows files are not run on this machine
    writeAtomic(
      join(root, asset.target),
      data,
      asset.root === 'bin' ? 0o755 : undefined
    )
  } else if (asset.kind === 'zip' || asset.kind === 'tar') {
    unpack(asset.kind, data, root)
    if (helper === 'umu') chmodSync(join(root, 'umu', 'umu-run'), 0o755)
  }
}

/** The Zoom installer is a script on its own site, with no versions: its own line says which one it is */
async function installZoomScript(layout: Layout, fetchFn: typeof fetch) {
  const data = await getBuffer(fetchFn, ZOOM_SCRIPT_URL)
  writeAtomic(join(layout.binRoot, 'zoom', 'zoom-platform.sh'), data, 0o755)
  return /INSTALLER_VERSION="([^"]+)"/.exec(data.toString('utf-8'))?.[1]
}

async function installHelper(
  layout: Layout,
  helper: HelperName,
  arches: Arch[],
  options: DownloadOptions,
  fetchFn: typeof fetch
) {
  const { latest = false, onProgress } = options
  if (helper === 'zoom-platform') {
    onProgress?.(`Downloading ${helper} from ${ZOOM_SCRIPT_URL}`)
    const version = await installZoomScript(layout, fetchFn)
    // Not pinned by hash (the script changes in its place): its version is what is recorded
    recordTag(layout.binRoot, helper, version ?? RELEASE_TAGS[helper])
    return
  }
  const repo = REPOS[helper]
  const tag =
    latest && repo ? await latestTag(repo, fetchFn) : RELEASE_TAGS[helper]
  onProgress?.(`Downloading ${helper} ${tag}`)
  for (const asset of assetsOf(helper, arches))
    await installAsset(layout, helper, asset, tag, !latest, fetchFn)
  recordTag(layout.binRoot, helper, tag)
}

/**
 * Downloads the helpers that are missing or not at the pinned version, one
 * after the other (a failure of one does not stop the rest).
 * @returns the helpers that failed, with the reason
 */
export async function downloadHelpers(
  layout: Layout,
  options: DownloadOptions = {}
): Promise<{ helper: HelperName; error: string }[]> {
  const { arches = [machineArch()], fetchFn = fetch, onProgress } = options
  const wanted =
    options.only ??
    (options.latest
      ? HELPERS
      : helperStates(layout, { arch: arches[0] })
          .filter(({ state }) => state !== 'ok')
          .map(({ helper }) => helper))

  const failures: { helper: HelperName; error: string }[] = []
  for (const helper of wanted) {
    try {
      await installHelper(layout, helper, arches, options, fetchFn)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      onProgress?.(`Failed: ${helper}: ${message}`)
      failures.push({ helper, error: message })
    }
  }
  if (!wanted.length)
    onProgress?.('Nothing to download: the helpers are up to date')
  return failures
}
