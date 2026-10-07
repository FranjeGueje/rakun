import { readdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, isAbsolute } from 'path'
import { addHandler } from 'backend/ipc'
import type { FolderListing } from 'common/rakun/folders'

/**
 * The folders inside `path` (the home folder when omitted), hidden ones too
 * (Proton GE lives in `~/.steam`), sorted by name. Throws a readable message
 * when the path is not absolute or cannot be read.
 */
export function listFolders(path: string = homedir()): FolderListing {
  if (!isAbsolute(path)) throw new Error('The path must be absolute')
  const folders = readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
  const parent = dirname(path)
  return { path, parent: parent === path ? null : parent, folders }
}

addHandler('listFolders', (_e, path) => listFolders(path ?? undefined))
