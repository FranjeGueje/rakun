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
