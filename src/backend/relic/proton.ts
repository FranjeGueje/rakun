import { existsSync, readdirSync } from 'fs'
import { join } from 'path'

/** The first folder of `compatDir` named like Proton (GE-Proton…), or '' when there is none */
export function detectGeProton(compatDir: string): string {
  try {
    if (!existsSync(compatDir)) return ''
    const found = readdirSync(compatDir).find((name) => /proton/i.test(name))
    return found ? join(compatDir, found) : ''
  } catch {
    return ''
  }
}

/**
 * The Proton folder to use: the one saved, or, when none is (empty means
 * «automatic»), the first one found now. Looking it up when it is needed, and
 * not only when the settings are created, finds a GE-Proton installed later.
 */
export function resolveProtonPath(saved: string, compatDir: string): string {
  return saved || detectGeProton(compatDir)
}
