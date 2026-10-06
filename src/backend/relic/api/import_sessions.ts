import { addHandler } from 'backend/ipc'
import { appDataPath, userDataPath } from 'backend/constants/paths'
import { legendaryConfigPath } from 'backend/storeManagers/legendary/constants'
import { gogdlAuthConfig } from 'backend/storeManagers/gog/constants'
import { nileConfigPath } from 'backend/storeManagers/nile/constants'
import { tokenPath as zoomTokenPath } from 'backend/storeManagers/zoom/constants'
import { configStore as gogConfigStore } from 'backend/storeManagers/gog/electronStores'
import { GOGUser } from 'backend/storeManagers/gog/user'
import { NileUser } from 'backend/storeManagers/nile/user'
import { ZoomUser } from 'backend/storeManagers/zoom/user'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync
} from 'fs'
import { dirname, join, relative } from 'path'
import type { Runner } from 'common/types'
import type { SessionImportResult, SessionsImport } from 'common/relic/accounts'
import { startRefresh } from './refresh'

type StoreSession = {
  // Where relicd keeps the session; Relic keeps it at the same place under
  // `~/.config/relic`
  dir: string
  // The file whose presence means "logged in"
  main: string
  // Credential files to copy, by name. Never installed games or library caches
  files: (relicDir: string) => string[]
}

const sessions: Record<Runner, StoreSession> = {
  legendary: {
    dir: legendaryConfigPath,
    main: 'user.json',
    files: () => ['user.json']
  },
  gog: {
    dir: dirname(gogdlAuthConfig),
    main: 'auth.json',
    files: () => ['auth.json']
  },
  nile: {
    dir: nileConfigPath,
    main: 'current_user.json',
    files: (relicDir) => [
      'current_user.json',
      ...readdirSync(relicDir).filter((name) => name.endsWith('.enc'))
    ]
  },
  zoom: {
    dir: dirname(zoomTokenPath),
    main: '.zoom.token',
    files: () => ['.zoom.token']
  }
}

const RUNNERS = Object.keys(sessions) as Runner[]

function relicDirFor(session: StoreSession): string {
  return join(appDataPath, 'relic', relative(userDataPath, session.dir))
}

/** Copies the credential files and returns where they landed in relicd */
function copyCredentials(session: StoreSession): string[] {
  const from = relicDirFor(session)
  mkdirSync(session.dir, { recursive: true })
  return session.files(from).map((name) => {
    const target = join(session.dir, name)
    copyFileSync(join(from, name), target)
    chmodSync(target, 0o600)
    return target
  })
}

// GOG and Zoom keep their "logged in" flag in a store, and both fill it in
// while asking the server who the user is. Epic needs nothing beyond the file.
async function isAcceptedByStore(runner: Runner): Promise<boolean> {
  if (runner === 'gog') {
    gogConfigStore.set('isLoggedIn', true)
    return !!(await GOGUser.getUserDetails())
  }
  if (runner === 'nile') return !!NileUser.getUserData()
  if (runner === 'zoom') return !!(await ZoomUser.getUserDetails())
  return true
}

function discardCopy(runner: Runner, copied: string[]): void {
  if (runner === 'gog') GOGUser.logout()
  else if (runner === 'zoom') ZoomUser.logout()
  else copied.forEach((file) => rmSync(file, { force: true }))
}

async function importSession(runner: Runner): Promise<SessionImportResult> {
  const session = sessions[runner]
  if (existsSync(join(session.dir, session.main))) return 'already'
  if (!existsSync(join(relicDirFor(session), session.main))) return 'missing'

  const copied = copyCredentials(session)
  if (await isAcceptedByStore(runner)) return 'imported'

  discardCopy(runner, copied)
  return 'invalid'
}

export async function importSessions(): Promise<SessionsImport> {
  const result = {} as SessionsImport
  for (const runner of RUNNERS) {
    result[runner] = await importSession(runner)
    if (result[runner] === 'imported') startRefresh(runner)
  }
  return result
}

addHandler('importSessionsFromRelic', () => importSessions())
