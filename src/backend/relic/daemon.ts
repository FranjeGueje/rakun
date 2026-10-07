import * as path from 'path'
import i18next from 'i18next'
import Backend from 'i18next-fs-backend'
import { supportedLanguages } from 'common/languages'
import { GlobalConfig } from 'backend/config'
import { configStore } from 'backend/constants/key_value_stores'
import { publicDir, userHome } from 'backend/constants/paths'
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
import { syncMountBin, createEosOverlayBat } from './windowify'
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

async function initTranslations() {
  const { language } = GlobalConfig.get().getSettings()

  await i18next.use(Backend).init({
    backend: {
      addPath: path.join(publicDir, 'locales', '{{lng}}', '{{ns}}'),
      allowMultiLoading: false,
      loadPath: path.join(publicDir, 'locales', '{{lng}}', '{{ns}}.json')
    },
    debug: false,
    returnEmptyString: false,
    returnNull: false,
    fallbackLng: 'en',
    lng: language,
    supportedLngs: supportedLanguages
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

  syncMountBin()
  createEosOverlayBat()

  await MigrationSystem.get().applyMigrations()

  initOnlineMonitor()
  void initStoreManagers()
  refreshUserDetailsWhenOnline()

  await initTranslations()

  createNecessaryFolders()
  configStore.set('userHome', userHome)

  await startApiServer()

  logInfo('Starting the Download Queue', LogPrefix.Backend)
  void initQueue()
}
