import { existsSync, readdirSync } from 'fs'
import type { ExecResult } from 'common/types'

const LAST_LINES = 3
const MAX_LENGTH = 400

const lastLines = (text: string | undefined, count: number) =>
  (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-count)

/** The folder of a game is there and has something in it (a helper that said nothing wrong may still have left it empty) */
export function hasFiles(folder: string): boolean {
  return existsSync(folder) && readdirSync(folder).length > 0
}

/**
 * Why a helper that ran did not do its job: it ended with an exit code other
 * than 0 (and was not stopped on purpose). Nothing when it ended well or the
 * code is not known. gogdl says «Not enough disk space» on stdout, the others
 * on stderr, so both are read.
 */
export function exitFailure(
  result: Pick<ExecResult, 'code' | 'abort' | 'stderr' | 'stdout'>
): string | undefined {
  const { code, abort, stderr, stdout } = result
  if (abort || typeof code !== 'number' || code === 0) return undefined
  const said = [
    ...lastLines(stdout, LAST_LINES),
    ...lastLines(stderr, LAST_LINES)
  ].join(' | ')
  const message = `The helper ended with code ${code}${said ? `: ${said}` : ''}`
  return message.slice(0, MAX_LENGTH)
}

/** How much of the previous chunk is kept, so a line split in two is still found */
const CHUNK_OVERLAP = 300

/**
 * Some helpers say a file failed and still end with code 0, the game saved as
 * installed: gogdl («Task writer failed»), legendary («Writing for … failed!»),
 * nile («Checksum error for …»). Only the end of stderr is kept, so the output
 * is watched while it comes
 */
export function failureWatcher(helper: string, pattern: RegExp) {
  let previous = ''
  let said: string | undefined
  return {
    watch: (data: string) => {
      said ??= (previous + data).match(pattern)?.[0]
      previous = data.slice(-CHUNK_OVERLAP)
    },
    failure: () =>
      said
        ? `${helper} said «${said.trim()}»: see the game's log`.slice(
            0,
            MAX_LENGTH
          )
        : undefined
  }
}
