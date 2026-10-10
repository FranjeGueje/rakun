import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import type { HelperInfo } from 'common/rakun/helpers'
import pkg_json from '../../../package.json'
import { CliError, createApi, readCredentials } from '../client'
import type { Ctx, Options } from '../context'
import { helpersLine } from './helpers'
import { isRunning, startRakun, stopRakun } from './service'
import { serviceInstalled } from './unit'
import { systemctl } from './systemd'

type Io = Pick<Ctx, 'log'>

const RELEASES_URL =
  'https://api.github.com/repos/FranjeGueje/rakun/releases/latest'
/** The only build the releases publish */
const PUBLISHED_ARCH = 'x64'

export type Latest = { version: string; url: string }

type Release = {
  tag_name?: string
  assets?: { name: string; browser_download_url: string }[]
}

/** Everything the command touches outside itself; the tests replace each piece */
export type Deps = {
  /** Where this rakunctl is */
  dir: string
  arch: string
  current: string
  latest: () => Promise<Latest>
  running: () => Promise<boolean>
  stop: (force?: boolean) => Promise<void>
  start: () => Promise<unknown>
  serviceInstalled: () => boolean
  startService: () => Promise<void>
  install: (url: string, log: Io['log']) => Promise<void>
  helpersLine: () => Promise<string>
}

/** The folder `install.sh` installs into: the only one this command replaces */
export const installDir = (home = homedir()) =>
  join(home, '.local', 'opt', 'rakun')

export const isOwnInstall = (dir: string, home = homedir()) =>
  resolve(dir) === installDir(home)

const numbers = (version: string) => version.split('.').map(Number)

/** `latest` is newer than `current`, both `x.y.z` */
export function isNewer(latest: string, current: string): boolean {
  const [a, b] = [numbers(latest), numbers(current)]
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

/** The newest release, as its version and the address of the tarball for this machine */
export function parseRelease(release: Release): Latest {
  const tag = release.tag_name ?? ''
  if (!/^v\d+\.\d+\.\d+$/.test(tag))
    throw new CliError(`The latest release has an unexpected tag: "${tag}"`)
  const version = tag.slice(1)
  const name = `rakun-${version}-linux-${PUBLISHED_ARCH}.tar.gz`
  const asset = release.assets?.find((a) => a.name === name)
  if (!asset) throw new CliError(`The release ${tag} has no ${name}`)
  return { version, url: asset.browser_download_url }
}

export async function fetchLatest(
  url = process.env.RAKUN_RELEASES_URL || RELEASES_URL,
  doFetch: typeof fetch = fetch
): Promise<Latest> {
  const response = await doFetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'rakunctl' }
  }).catch((error: unknown) => {
    throw new CliError(`Could not reach GitHub: ${String(error)}`)
  })
  if (!response.ok)
    throw new CliError(
      response.status === 403 || response.status === 429
        ? 'GitHub refused the request (too many in a short time?): try again later'
        : `Could not read the latest release (HTTP ${response.status})`
    )
  return parseRelease((await response.json()) as Release)
}

/** Runs the `install.sh` of the tarball that is installed: it checks the checksum and replaces the folder last */
export function runInstaller(
  dir: string,
  url: string,
  log: Io['log']
): Promise<void> {
  const script = join(dir, 'install.sh')
  if (!existsSync(script))
    return Promise.reject(
      new CliError(
        `${script} does not exist: this version has no self-update. Install the new one by hand once (see the wiki)`
      )
    )
  return new Promise((done, fail) => {
    const child = spawn(script, [url], {
      env: { ...process.env, RAKUN_SELF_UPDATE: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const forward = (chunk: Buffer) =>
      chunk
        .toString()
        .split('\n')
        .filter(Boolean)
        .forEach((line) => log(line))
    child.stdout.on('data', forward)
    child.stderr.on('data', forward)
    child.once('error', (error) => fail(new CliError(String(error))))
    child.once('close', (code) =>
      code === 0
        ? done()
        : fail(new CliError(`install.sh failed (code ${code})`))
    )
  })
}

function realDeps(opts: Pick<Options, 'force'>): Deps {
  return {
    dir: __dirname,
    arch: process.arch,
    current: pkg_json.version,
    latest: () => fetchLatest(),
    running: () => isRunning(),
    stop: () => stopRakun(opts.force),
    start: () => startRakun(),
    serviceInstalled: () => serviceInstalled(),
    startService: () => systemctl(['start', 'rakun.service']),
    install: (url, log) => runInstaller(__dirname, url, log),
    helpersLine: async () =>
      helpersLine(
        await createApi(readCredentials()).call<HelperInfo[]>('getHelpers')
      )
  }
}

/** Only an install made by `install.sh` is replaced, and only where a build is published */
function checkManaged({ dir, arch }: Pick<Deps, 'dir' | 'arch'>): void {
  if (!isOwnInstall(dir))
    throw new CliError(
      `This rakun is not in ${installDir()}, so it was not installed by install.sh: update it the way you installed it`
    )
  if (arch !== PUBLISHED_ARCH)
    throw new CliError(`There is no published build for ${arch}`)
}

function report(
  ctx: Io,
  json: boolean,
  { current, latest }: { current: string; latest: string }
): void {
  const updateAvailable = isNewer(latest, current)
  if (json) return ctx.log(JSON.stringify({ current, latest, updateAvailable }))
  ctx.log(
    updateAvailable
      ? `rakun ${latest} is available (you have ${current}): run "rakunctl self-update"`
      : `rakun ${current} is up to date`
  )
}

/** Installs the new version; if that fails the old one stays and runs again if it was running */
async function replace(
  ctx: Io,
  deps: Deps,
  latest: Latest,
  wasRunning: boolean
): Promise<void> {
  const restart = () =>
    deps.serviceInstalled() ? deps.startService() : deps.start()
  if (wasRunning) await deps.stop()
  try {
    await deps.install(latest.url, ctx.log)
  } catch (error) {
    if (wasRunning) await restart()
    throw error
  }
  ctx.log(`rakun ${latest.version} installed`)
  if (!wasRunning) return
  await restart()
  ctx.log(
    'rakun started again (a --web or --port you gave by hand is not kept)'
  )
  ctx.log(await deps.helpersLine())
}

/** `self-update`: installs the newest release; `--check` only says if there is one */
export async function selfUpdate(
  ctx: Io,
  opts: Pick<Options, 'check' | 'force'>,
  json = false,
  deps: Deps = realDeps(opts)
): Promise<void> {
  checkManaged(deps)
  const latest = await deps.latest()
  if (opts.check || !isNewer(latest.version, deps.current))
    return report(ctx, json, { current: deps.current, latest: latest.version })
  await replace(ctx, deps, latest, await deps.running())
}
