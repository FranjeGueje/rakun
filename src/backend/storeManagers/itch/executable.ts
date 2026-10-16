import { execFile } from 'child_process'
import { chmodSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { basename, dirname, join, sep } from 'path'
import { promisify } from 'util'
import { machineArch } from 'backend/rakun/helpers/files'
import { butlerBinary } from './client'

const run = promisify(execFile)

export type Platform = 'windows' | 'linux'

/** A file butler thinks can be run: its path relative to the folder it looked in */
export type Candidate = { path: string; flavor: string; size: number }

/**
 * What the file of an installer, an uninstaller or a crash reporter is called (without its
 * extension): the whole name, so that a game called "Installer Simulator" is still a game
 */
const NOT_THE_GAME =
  /^(setup|install(er)?|unins\w*|uninstall(er)?|dxsetup|.*redist.*|.*crash.?(handler|report(er)?)\w*|.*[ ._-](setup|install(er)?))$/i

const isTheGame = ({ path }: Candidate) =>
  !NOT_THE_GAME.test(basename(path).replace(/\.[^.]+$/, ''))

/** The first one butler ranks, unless it is an installer and there is anything else */
export function pickCandidate(candidates: Candidate[]): Candidate | undefined {
  return candidates.find(isTheGame) ?? candidates[0]
}

/** The `result` line of `butler --json`: the other lines are logs */
export function parseCandidates(stdout: string): Candidate[] {
  for (const line of stdout.split('\n')) {
    try {
      const message = JSON.parse(line) as {
        type?: string
        value?: { candidates?: Candidate[] | null }
      }
      if (message.type === 'result') return message.value?.candidates ?? []
    } catch {
      // Not JSON: not the line we want
    }
  }
  return []
}

/** What butler finds to run in an install, for a platform: nothing if it finds nothing */
export async function findExecutable(
  folder: string,
  platform: Platform
): Promise<string | undefined> {
  const { stdout } = await run(
    butlerBinary(),
    [
      '--json',
      'configure',
      '--os-filter',
      platform,
      '--arch-filter',
      machineArch() === 'arm64' ? 'arm64' : 'amd64',
      folder
    ],
    { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }
  )
  return pickCandidate(parseCandidates(stdout))?.path
}

const quote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`

/** The script Steam runs for a Linux game: it goes to where the executable is and runs it */
export function startScriptText(executable: string): string {
  const dir = dirname(executable)
  const cd =
    dir === '.' ? '"$(dirname "$0")"' : `"$(dirname "$0")"/${quote(dir)}`
  return `#!/bin/sh\ncd ${cd} || exit 1\nexec ./${quote(basename(executable))} "$@"\n`
}

/**
 * The executable has to be inside the install once the links of the game are
 * followed: a game is somebody else's archive, and a link in it could point at
 * a file of yours (which chmod would then change).
 */
function runnableInside(folder: string, executable: string): string {
  const root = realpathSync(folder)
  const real = realpathSync(join(folder, executable))
  if (!real.startsWith(root + sep))
    throw Error(`${executable} leads out of the install folder`)
  return real
}

/** Writes `start.sh` in the install and makes it and the executable runnable */
export function writeStartScript(folder: string, executable: string) {
  chmodSync(runnableInside(folder, executable), 0o755)
  const script = join(folder, 'start.sh')
  // A `start.sh` that came with the game may be a link to somewhere else: remove
  // it (the link, not what it points to) and write a file of our own
  rmSync(script, { force: true })
  writeFileSync(script, startScriptText(executable), { flag: 'wx' })
  chmodSync(script, 0o755)
}
