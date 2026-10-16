import { readdir, stat } from 'fs/promises'
import { join, relative } from 'path'
import { logError, LogPrefix } from 'backend/logger'

/** Every `.exe` under `dir`, recursively (full paths); a folder that cannot be read is logged and skipped */
async function findExes(dir: string): Promise<string[]> {
  let exes: string[] = []
  try {
    for (const file of await readdir(dir, { withFileTypes: true })) {
      const fullPath = join(dir, file.name)
      if (file.isDirectory()) {
        exes = exes.concat(await findExes(fullPath))
      } else if (file.name.toLowerCase().endsWith('.exe')) {
        exes.push(fullPath)
      }
    }
  } catch (error) {
    logError(
      `Error finding .exe files in ${dir}: ${String(error)}`,
      LogPrefix.Zoom
    )
  }
  return exes
}

const letters = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * The game's executable among what a Windows installer left in `installPath`
 * (relative to it): the only `.exe` that is not an installer or redistributable;
 * if there are several, the one named like the game, or else the biggest.
 * Empty when there is none.
 */
export async function pickWindowsExecutable(
  installPath: string,
  title: string
): Promise<string> {
  const exes = (await findExes(installPath))
    .map((file) => relative(installPath, file))
    .filter((name) => !/setup|unins|redist/i.test(name))
  if (exes.length <= 1) return exes[0] ?? ''

  const gameName = letters(title)
  const named = exes.find((exe) => letters(exe).includes(gameName))
  if (named) return named

  const sizes = await Promise.all(
    exes.map(async (exe) => (await stat(join(installPath, exe))).size)
  )
  return exes[sizes.indexOf(Math.max(...sizes))]
}
