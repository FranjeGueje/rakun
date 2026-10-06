// Only these channels are reachable through the HTTP API. Anything that opens
// windows, touches arbitrary paths or restarts the daemon is deliberately left
// out (removeFolder, getShellPath, pathExists, resetRelic, openFolder, ...).
// A channel is either a handler (request/response) or a listener (fire and
// forget); the server decides by looking at what is registered.

export const exposedChannels: ReadonlySet<string> = new Set([
  // Library
  'getLibrary',
  'refreshLibrary',
  'getRefreshingLibraries',
  'getGameInfo',
  'getExtraInfo',
  'getInstallInfo',
  'getGOGLinuxInstallersLangs',
  'isGameAvailable',
  'isNative',
  'checkGameUpdates',
  'checkDiskSpace',
  'getKnownFixes',
  // Install, update, repair, uninstall
  'install',
  'updateGame',
  'uninstall',
  'repair',
  'kill',
  'moveInstall',
  'importGame',
  'changeInstallPath',
  'changeGameVersionPinnedStatus',
  // Download queue
  'getDMQueueInformation',
  'pauseCurrentDownload',
  'resumeCurrentDownload',
  'cancelDownload',
  'removeFromDMQueue',
  // Accounts
  'getAccounts',
  'importSessionsFromRelic',
  'isLoggedIn',
  'getUserInfo',
  'getAmazonUserInfo',
  'getZoomUserInfo',
  'getLoginInfo',
  'submitLogin',
  'getAmazonLoginData',
  'login',
  'authGOG',
  'authAmazon',
  'authZoom',
  'logoutLegendary',
  'logoutGOG',
  'logoutAmazon',
  'logoutZoom',
  // Settings and status
  'requestAppSettings',
  'requestGameSettings',
  'writeConfig',
  'setSetting',
  'steamgriddb.hasApiKey',
  'steamgriddb.setApiKey',
  'getRelicVersion',
  'getEpicGamesStatus',
  'get-connectivity-status',
  'set-connectivity-online',
  'getSystemInfo'
])

// Events published on GET /events
export const exposedEvents: ReadonlySet<string> = new Set([
  'gameStatusUpdate',
  'progressUpdate',
  'changedDMQueueInformation',
  'pushGameToLibrary',
  'refreshLibrary',
  'recentGamesChanged',
  'metadataChanged',
  'connectivity-changed',
  'showDialog'
])
