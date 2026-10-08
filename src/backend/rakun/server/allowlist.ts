// Only these channels are reachable through the HTTP API. A channel that opens
// windows, touches arbitrary paths or restarts the daemon must not be added.
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
  'getUpdateableGames',
  'getHelpers',
  'updateHelpers',
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
  'getPrivateBranchPassword',
  'setPrivateBranchPassword',
  // Download queue
  'getDMQueueInformation',
  'pauseCurrentDownload',
  'resumeCurrentDownload',
  'cancelDownload',
  'removeFromDMQueue',
  'clearFinishedDMQueue',
  // Accounts
  'getStores',
  'getAccounts',
  'listFolders',
  'logout',
  'importSessionsFromRelic',
  'getLoginInfo',
  'submitLogin',
  // Settings and status
  'requestAppSettings',
  'writeConfig',
  'setSetting',
  'getMaxCpus',
  'clearCache',
  'resetRakun',
  'stopRakun',
  'steamgriddb.hasApiKey',
  'steamgriddb.setApiKey',
  'getRakunVersion',
  'getEpicGamesStatus',
  'get-connectivity-status',
  'set-connectivity-online',
  'getSystemInfo',
  'getLogContent',
  'getLegendaryVersion',
  'getGogdlVersion',
  'getNileVersion'
])

// Events published on GET /events
export const exposedEvents: ReadonlySet<string> = new Set([
  'gameStatusUpdate',
  'progressUpdate',
  'changedDMQueueInformation',
  'pushGameToLibrary',
  'refreshLibrary',
  'helpersProgress',
  'connectivity-changed',
  'showDialog'
])
