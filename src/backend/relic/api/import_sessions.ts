import { addHandler } from 'backend/ipc'
import { appDataPath, userDataPath } from 'backend/constants/paths'
import { RUNNERS, stores } from 'backend/storeManagers'
import type { Runner } from 'common/types'
import type { SessionImportResult, SessionsImport } from 'common/relic/accounts'
import type { StoreSession } from 'backend/storeManagers/store'
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'fs'
import { join, relative } from 'path'
import { startRefresh } from './refresh'

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

async function importSession(runner: Runner): Promise<SessionImportResult> {
  const { session } = stores[runner]
  if (existsSync(join(session.dir, session.main))) return 'already'
  if (!existsSync(join(relicDirFor(session), session.main))) return 'missing'

  const copied = copyCredentials(session)
  if (await session.isAccepted()) return 'imported'

  session.discard(copied)
  return 'invalid'
}

async function importSessions(): Promise<SessionsImport> {
  const result = {} as SessionsImport
  for (const runner of RUNNERS) {
    result[runner] = await importSession(runner)
    if (result[runner] === 'imported') startRefresh(runner)
  }
  return result
}

addHandler('importSessionsFromRelic', () => importSessions())
