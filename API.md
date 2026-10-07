# relicd API

relicd is a local service. Clients (the Invasor module, `relicctl`, `scripts/smoke.sh`) talk
to it over HTTP on the loopback address. Channels and payloads are the ones
typed in `src/common/types/ipc.ts` (`AsyncIPCFunctions`, `SyncIPCFunctions`,
`FrontendMessages`); the channels reachable over HTTP are listed in
`src/backend/relic/server/allowlist.ts`.

## Connecting

`~/.config/relicd/api.json` (mode 0600) holds `{"port": 17370, "token": "…"}`.
The token is generated once and survives restarts; `RELICD_PORT` overrides the
port. The server only listens on `127.0.0.1`.

| Request               | Needs token | Purpose                         |
| --------------------- | ----------- | ------------------------------- |
| `GET /health`         | no          | `{"status":"ok","version":"…"}` |
| `POST /api/<channel>` | yes         | call a channel                  |
| `GET /events`         | yes         | Server-Sent Events stream       |

The token goes in the `x-relicd-token` header. Requests with an `Origin`
header (browsers) or a `Host` other than `127.0.0.1:<port>` / `localhost:<port>`
get `403`.

## Calling a channel

`POST /api/<channel>` with `{"args": [arg1, arg2, …]}` (the same arguments the
channel takes in `ipc.ts`; omit the body when there are none).

| Status | Body                                                       |
| ------ | ---------------------------------------------------------- |
| 200    | `{"result": <value>}`; `null` for fire-and-forget channels |
| 400    | `{"error": "…"}` malformed JSON or `args` not an array     |
| 401    | missing or wrong token                                     |
| 403    | channel not in the allow list                              |
| 404    | exposed channel with nothing registered                    |
| 500    | `{"error": "…"}` the handler threw                         |

## Channels

**Library:** `getLibrary(runner | 'all')` returns `GameInfo[]` (with install
state and overrides) as last refreshed. `refreshLibrary(runner | 'all')`
**returns at once** and refreshes in the background (a store can take minutes;
a refresh already running for a store is joined, not repeated). When each store
ends, `refreshLibrary` fires on `/events` with the store name: call
`getLibrary` again then. `getRefreshingLibraries` lists the stores refreshing
now. Logging in refreshes that store by itself.
`getGameInfo(appName, runner)`, `getExtraInfo`, `getInstallInfo(appName,
runner, platform, build?, branch?)`, `isGameAvailable`, `isNative`,
`checkGameUpdates`, `checkDiskSpace(folder)`, `getKnownFixes`.

**Install, update, repair, uninstall:** `install(InstallParams)` (`installDlcs` omitted installs every DLC, `[]` none, and
a list only those on GOG; Epic cannot pick, so any non-empty list means all) and
`updateGame(InstallParams)` put the game in the download queue; when the
install finishes relicd runs the Steam integration (see README) and the game
shows up in Steam. `uninstall(appName, runner, removePrefix)`,
`repair(appName, runner)`, `kill(appName, runner)`, `moveInstall`,
`importGame`, `changeInstallPath`, `changeGameVersionPinnedStatus`.
For a GOG private beta branch, `setPrivateBranchPassword(appName, password)`
stores the password and `getPrivateBranchPassword(appName)` returns it; install
or update with that `branch`.

**Download queue:** `getDMQueueInformation` → `{elements, finished, state}`,
`pauseCurrentDownload`, `resumeCurrentDownload`, `cancelDownload`,
`removeFromDMQueue`, `clearFinishedDMQueue` (empties the `finished` list; installed
games stay). `relicctl pause`, `resume`, `cancel [--remove-files]` and
`queue clear` wrap them.

**Accounts:** `getStores` → `[{id, name, label}]` (the stores relicd supports, in
the order to show them; `id` is the `runner` every channel takes, `name` the
short name to type or show, e.g. `epic` for `legendary`). `getAccounts` →
`{<id>: {loggedIn, name?}}` from what is stored locally (no network),
`logout(runner)`, `importSessionsFromRelic` and the two-step login below. A
`runner` that is not one of the stores answers `500` with `Unknown store`.

`importSessionsFromRelic` (no arguments) copies the store sessions from
`~/.config/relic` once and never overwrites a session relicd already has. It
returns `{<id>: result}`, each `imported`, `already`, `missing`
(Relic has none) or `invalid` (the store rejected it, or no connection to check;
nothing is kept). Installed games are not imported. The copy shares the refresh
token, so the store may end the session in Relic.

**Artwork:** `steamgriddb.hasApiKey` → boolean and `steamgriddb.setApiKey(key)`.
Without a SteamGridDB key relicd skips the grid images when it adds a game to
Steam (it is stored in `config.json`, so a game installed before setting it has
to be reinstalled to get them).

**Settings and status:** `requestAppSettings`, `writeConfig(config)`,
`setSetting({key, value})` (all settings are global; `relicctl config [key [value]]`
reads and sets them), `clearCache(library?)` (library caches, all stores or one;
`relicctl cache clear [store]`), `resetRelic` (forgets sessions, settings, the
queue and per-game data, keeps installed games and `api.json`, then relicd
stops; `relicctl reset`),
`getRelicVersion`, `getEpicGamesStatus`, `get-connectivity-status`,
`getSystemInfo`, `getLogContent` (see Logs below; `relicctl logs`), and the helper versions `getLegendaryVersion`,
`getGogdlVersion`, `getNileVersion`, `getCometVersion`. There are no
per-game settings: relicd does not launch games.

## Logs

`getLogContent(args)` returns the text of a log file, or `""` when it does not
exist or `args` is not valid. `{}` is relicd's own log, `{runner}` (`legendary`,
`gog`, `nile`, `zoom`, `comet`) is that store's helper, and `{appName, runner,
type}` is one game's log (`type`: `install`, `import`, `repair`, `update`,
`setup`; `launch` by default). Names must be plain: anything with a path
separator is refused.

## Logging in (no embedded browser)

1. `getLoginInfo(runner)` → `{runner, url, instructions}`. The client shows
   `url` (the user opens it in any browser) and the instructions.
2. After logging in, the user pastes what the browser ended on into
   `submitLogin(runner, pasted)` → `{ok, error?}`. `pasted` can be the full
   address of the final page, the JSON Epic shows (`authorizationCode`), or the
   bare code (for Zoom, the `li_token`).

| `runner`           | What ends up in the browser                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `legendary` (Epic) | JSON with `authorizationCode`                                                                                      |
| `gog`              | `https://embed.gog.com/on_login_success?…&code=…` (page may look blank)                                            |
| `nile` (Amazon)    | address with `openid.oa2.authorization_code=…`; call `getLoginInfo('nile')` first, it stores the one-time verifier |
| `zoom`             | address with `li_token=…`                                                                                          |

On success the library of that store is refreshed.

## Events (`GET /events`)

Server-Sent Events: `event: <channel>` and `data: <JSON array of arguments>`.
A `: ping` comment is sent every 25 s.

`gameStatusUpdate(status)`, `progressUpdate(status)`,
`changedDMQueueInformation(elements, state)`, `pushGameToLibrary(info)`,
`refreshLibrary(runner?)`,
`connectivity-changed`, `showDialog(title, message, type, buttons?)`.

`showDialog` is how the daemon reports problems it used to show in a window
(it is also logged).
