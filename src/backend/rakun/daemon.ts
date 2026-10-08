import { configStore } from 'backend/constants/key_value_stores'
import { userHome } from 'backend/constants/paths'
import { LegendaryUser } from 'backend/storeManagers/legendary/user'
import { GOGUser } from 'backend/storeManagers/gog/user'
import { initStoreManagers } from 'backend/storeManagers'
import { initQueue } from 'backend/downloadmanager/downloadqueue'
import { initOnlineMonitor, runOnceWhenOnline } from 'backend/online_monitor'
import { createNecessaryFolders, handleExit } from 'backend/utils'
import MigrationSystem from 'backend/migration'
import {
  init as initLogger,
  logError,
  logInfo,
  LogPrefix
} from 'backend/logger'
import { createEosOverlayBat } from './windowify'
import { checkHelpersAtStart } from './helpers/locations'
import { writeRunnerScript } from './runner_script'
import { startApiServer } from './server'
import './api'

function refreshUserDetailsWhenOnline() {
  runOnceWhenOnline(() => {
    if (!LegendaryUser.isLoggedIn()) {
      logInfo('User Not Found, removing it from Store', {
        prefix: LogPrefix.Backend,
        forceLog: true
      })
      configStore.delete('userInfo')
    }

    if (GOGUser.isLoggedIn()) {
      void GOGUser.getUserDetails()
    }
  })
}

function logUnhandledErrors() {
  process.on('uncaughtException', (err) => logError(err, LogPrefix.Backend))
  process.on('unhandledRejection', (reason) =>
    logError(reason, LogPrefix.Backend)
  )
}

function stopOnSignals() {
  process.on('SIGTERM', () => handleExit())
  process.on('SIGINT', () => handleExit())
}

export async function startDaemon() {
  initLogger()
  logUnhandledErrors()
  stopOnSignals()

  checkHelpersAtStart()
  writeRunnerScript()
  createEosOverlayBat()

  await MigrationSystem.get().applyMigrations()

  initOnlineMonitor()
  void initStoreManagers()
  refreshUserDetailsWhenOnline()

  createNecessaryFolders()
  configStore.set('userHome', userHome)

  await startApiServer()

  logInfo('Starting the Download Queue', LogPrefix.Backend)
  void initQueue()
}
