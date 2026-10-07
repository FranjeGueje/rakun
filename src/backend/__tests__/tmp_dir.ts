import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

export type DirResult = { name: string; removeCallback: () => void }

/** A folder in the system temp dir that `removeCallback` deletes */
export function dirSync(): DirResult {
  const name = mkdtempSync(join(tmpdir(), 'rakun-test-'))
  return {
    name,
    removeCallback: () => rmSync(name, { recursive: true, force: true })
  }
}
