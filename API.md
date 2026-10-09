# rakun API

rakun is a local service. Clients (rakun's own web, the Invasor module, `rakunctl`, `scripts/smoke.sh`) talk to it over HTTP on the loopback address. Channels and payloads are the ones typed in `src/common/types/ipc.ts` (`AsyncIPCFunctions`, `SyncIPCFunctions`, `FrontendMessages`); the channels reachable over HTTP are listed in `src/backend/rakun/server/allowlist.ts`.

## Connecting

`~/.config/rakun/api.json` (mode 0600) holds `{"port": 17370, "token": "…"}`. The token is generated once and survives restarts. The port is the one in `api.json`; `RAKUN_PORT` or `rakun --port=<n>` change it (and it is saved there). The server listens on `127.0.0.1` unless the web is opened to the network (see below).

| Request               | Needs token | Purpose                                       |
| --------------------- | ----------- | --------------------------------------------- |
| `GET /health`         | no          | `{"status":"ok","version":"…","web":"local"}` |
| `POST /api/<channel>` | yes         | call a channel                                |
| `GET /events`         | yes         | Server-Sent Events stream                     |

The token goes in the `x-rakun-token` header. If nothing answers on the port, rakun is stopped: start it (`rakunctl start`, or run `rakun`) and read `api.json` after it answers `/health`. A `Host` that is not one of this machine's (`127.0.0.1:<port>`, `localhost:<port>`, and in `network` mode its addresses and name) gets `403`, and so does an `Origin` header (a browser) that is not the page rakun itself served (`http://<Host>`).

## The web

rakun's own web (`web/` in the repository, built by `pnpm build` into `build/web` and shipped as `web/` next to `rakun.cjs`; `RAKUN_WEB_DIR` points to another folder) is served by `GET /`: open `http://127.0.0.1:17370` in a browser on this machine. The files need no token. `index.html` comes with the token inside (`<meta name="rakun-token" content="…">`) and the web mode (`<meta name="rakun-web">`), and the page sends the token like any other client; another web cannot read it (it is refused by `Origin` and `Host`). Without that folder these paths answer `404`/`401` and everything else works the same. The web logs in by pasting (see the login below); a browser cannot watch the page of a store.

### Who can open the web (`webAccess`)

| Mode                  | Listens on  | Web                              | Settings from     |
| --------------------- | ----------- | -------------------------------- | ----------------- |
| `local` (the default) | `127.0.0.1` | yes                              | this machine      |
| `network`             | `0.0.0.0`   | yes, for anyone who can reach it | this machine only |
| `off`                 | `127.0.0.1` | no (no page is served)           | this machine      |

`off` keeps the API on this machine: `rakunctl`, `start`/`stop` and the clients need it. Choose with `rakun --web=<mode> --port=<n>` (`rakunctl start` forwards both), with `RAKUN_WEB`, or with the saved setting `webAccess` (`rakunctl config webAccess network`), in that order of priority. It takes effect when rakun starts; an invalid value stops it with the reason in the log.

**`network` has no protection.** The page carries the token for whoever loads it, so anyone who can reach the machine controls rakun. It is for experimental or home use on a network you trust, over plain HTTP. What it still does: it only accepts a `Host` that is the machine's own address or name (so a web on the internet cannot reach rakun through the visitor's browser: DNS rebinding), and `writeConfig`, `setSetting`, `resetRakun`, `stopRakun`, `steamgriddb.setApiKey`, `getLogContent`, `listFolders`, `importGame`, `moveInstall`, and `updateHelpers` (downloads programs that rakun then runs) answer `403` to anything that is not this machine (an `altLegendaryBin` setting makes rakun run that program; the others read secrets or walk the disk). The error is `"<channel>" can only be called from the machine rakun runs on: open the web there as http://127.0.0.1:<port>`; being on this machine but using its LAN address counts as remote. `install` with a `path` stays open: it is how the web installs, so anyone who can reach the port can write a game's files in any folder you can write to. A reverse proxy installed on this machine would make visits from outside look local, so do not put one in front. Warnings: the log at startup, `rakunctl start` and `status`, a small banner in the web, and `/health` reports `"web":"network"`.

## Calling a channel

`POST /api/<channel>` with `{"args": [arg1, arg2, …]}` (the same arguments the channel takes in `ipc.ts`; omit the body when there are none).

| Status | Body                                                       |
| ------ | ---------------------------------------------------------- |
| 200    | `{"result": <value>}`; `null` for fire-and-forget channels |
| 400    | `{"error": "…"}` malformed JSON or `args` not an array     |
| 401    | missing or wrong token                                     |
| 403    | channel not in the allow list                              |
| 404    | exposed channel with nothing registered                    |
| 500    | `{"error": "…"}` the handler threw                         |

## Channels

**Library:** `getLibrary(runner | 'all')` returns `GameInfo[]` (with install state and overrides) as last refreshed. `refreshLibrary(runner | 'all')` **returns at once** and refreshes in the background (a store can take minutes; a refresh already running for a store is joined, not repeated). When each store ends, `refreshLibrary` fires on `/events` with the store name: call `getLibrary` again then. `getRefreshingLibraries` lists the stores refreshing now. Logging in refreshes that store by itself. `getGameInfo(appName, runner)`, `getExtraInfo`, `getInstallInfo(appName, runner, platform, build?, branch?)`, `isGameAvailable`, `checkGameUpdates` (nothing runs by itself: a client calls it; with `autoUpdateGames` it queues the updates), `getHelpers` (the helper binaries: `{ helper, pinned, installed, state }[]`, `state` being `ok`, `missing` or `other`), `updateHelpers({ latest? })` (downloads the missing ones, checked by sha256, or the newest of all with `latest`, unchecked; progress arrives as `helpersProgress` events, whose last line is `done`; answers `{ helpers, failures }`), `getUpdateableGames` (`{ runner, appName }[]` of the installed games with a newer version; it queues nothing and Zoom never lists any).

**Install, update, repair, uninstall:** `install(InstallParams)` (answers `500` `already installed: use repair or update` if the game is installed; `installDlcs` omitted installs every DLC, `[]` none, and a list only those on GOG; Epic cannot pick, so any non-empty list means all) and `updateGame(InstallParams)` put the game in the download queue; when the install finishes rakun runs the Steam integration (see README) and the game shows up in Steam. `uninstall(appName, runner, removePrefix)`, `repair(appName, runner)`, `kill(appName, runner)`, `moveInstall`, `importGame({ appName, path, runner, platform })` (registers a game that is already in `path`; it answers `{ status: 'error' }` when the store reported an error and `done` otherwise, an abort included, so a client that must be sure checks that the game is installed), `changeGameVersionPinnedStatus`.

**Download queue:** `getDMQueueInformation` → `{elements, finished, state}`, `pauseCurrentDownload`, `resumeCurrentDownload`, `cancelDownload`, `removeFromDMQueue`, `clearFinishedDMQueue` (empties the `finished` list; installed games stay). `rakunctl pause`, `resume`, `cancel [--remove-files]` and `queue clear` wrap them.

**Accounts:** `getStores` → `[{id, name, label}]` (the stores rakun supports, in the order to show them; `id` is the `runner` every channel takes, `name` the short name to type or show, e.g. `epic` for `legendary`). `getAccounts` → `{<id>: {loggedIn, name?}}` from what is stored locally (no network), `logout(runner)` and the two-step login below. A `runner` that is not one of the stores answers `500` with `Unknown store`.

**Folders:** `listFolders(path?)` → `{path, parent, folders}`: the folders inside `path` (the home folder when omitted), hidden ones too, sorted; `parent` is `null` at the root. `path` has to be absolute; one that cannot be read answers `500` with the reason. It is for a client that lets the user pick a folder.

**Artwork:** `steamgriddb.hasApiKey` → boolean and `steamgriddb.setApiKey(key)`. Without a SteamGridDB key rakun skips the grid images when it adds a game to Steam (it is stored in `config.json`, so a game installed before setting it has to be reinstalled to get them).

**Settings:** `requestAppSettings` returns them all; `setSetting({key, value})` changes one and `writeConfig(partial)` several. They are global (rakun does not launch games, so there are no per-game settings) and **validated**: an unknown key, a value of another type or one that breaks its rule answers `500` with the reason and saves nothing. `rakunctl config [key [value]]` wraps them.

| Key                                            | Rule                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `defaultInstallPath`                           | absolute path (default `~/Games/Rakun`)                                      |
| `protonPath`                                   | empty, or a folder with the `proton` script (default: first GE-Proton found) |
| `maxWorkers`                                   | integer from 0 (automatic) to `getMaxCpus`                                   |
| `language`                                     | one of the supported codes; takes effect at once (GOG default language)      |
| `autoUpdateGames`                              | boolean: when true, `checkGameUpdates` queues the updates itself             |
| `steamGridDbApiKey`                            | text (also `steamgriddb.setApiKey`)                                          |
| `defaultSteamPath`                             | Steam folder (default `~/.steam/steam`)                                      |
| `altLegendaryBin`, `altGogdlBin`, `altNileBin` | empty, or an existing file                                                   |
| `webAccess`                                    | `local`, `network` or `off`: who can open the web (read when rakun starts)   |

**Maintenance:** `clearCache(library?)` empties the library caches (all stores or one; `rakunctl cache clear [store]`). `resetRakun` forgets sessions, settings, the queue and per-game data, keeps installed games and `api.json`, and then rakun stops (`rakunctl reset`). `stopRakun` answers and stops rakun a second later (`rakunctl stop`); rakun has to be started again by the client (`rakunctl start`) unless a service manager does it.

**Status:** `getRakunVersion` and `getLogContent` (see Logs below; `rakunctl logs`). `getGOGLinuxInstallersLangs(appName)` lists the languages of a GOG Linux installer. `getMaxCpus` returns the number of CPUs.

Zoom Platform's Windows installers (experimental) open a window through Proton: rakun needs a `DISPLAY` for them (desktop mode, not game mode) and `protonPath` set, or the install ends in error. It checks the screen before downloading anything. A queue entry that ends in `error` carries the reason in its `error` field (in `getDMQueueInformation().finished`); `rakunctl install` prints it.

rakun has no translations: the text of its messages and of `showDialog` is in English.

## Logs

`getLogContent(args)` returns the text of a log file, or `""` when it does not exist or `args` is not valid. `{}` is rakun's own log, `{runner}` (`legendary`, `gog`, `nile`, `zoom`) is that store's helper, and `{appName, runner, type}` is one game's log (`type`: `install`, `import`, `repair`, `update`, `setup`; `launch` by default). Names must be plain: anything with a path separator is refused.

## Logging in (no embedded browser)

1. `getLoginInfo(runner)` → `{runner, url, instructions}`. The client shows `url` (the user opens it in any browser) and the instructions.
2. After logging in, the user pastes what the browser ended on into `submitLogin(runner, pasted)` → `{ok, error?}`. `pasted` can be the full address of the final page, the JSON Epic shows (`authorizationCode`), or the bare code (for Zoom, the `li_token`).

| `runner`           | What ends up in the browser                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `legendary` (Epic) | JSON with `authorizationCode`                                                                                      |
| `gog`              | `https://embed.gog.com/on_login_success?…&code=…` (page may look blank)                                            |
| `nile` (Amazon)    | address with `openid.oa2.authorization_code=…`; call `getLoginInfo('nile')` first, it stores the one-time verifier |
| `zoom`             | address with `li_token=…`                                                                                          |

On success the library of that store is refreshed.

## Events (`GET /events`)

Server-Sent Events: `event: <channel>` and `data: <JSON array of arguments>`. A `: ping` comment is sent every 25 s.

`gameStatusUpdate(status)`, `progressUpdate(status)`, `changedDMQueueInformation(elements, state)`, `pushGameToLibrary(info)`, `refreshLibrary(runner?)`, `helpersProgress(line)`, `connectivity-changed`, `showDialog(title, message, type, buttons?)`.

`showDialog` is how the daemon reports problems it used to show in a window (it is also logged).
