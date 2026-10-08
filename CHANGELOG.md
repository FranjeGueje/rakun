# Changelog

The history of Relic (and of the Heroic cleanup) lives in the `upstream`
repository.

## Unreleased — Rakun

### Added

- `rakunctl update [store [app]]`: with no arguments it updates every installed game that has a new version, with a store only that store's; a failure does not stop the rest. New channel `getUpdateableGames`.
- `rakunctl install-service` and `uninstall-service`: rakun as a systemd user service (no `DISPLAY`: Zoom installers do not work with it).
- `AUTHORS` and a note on the origin (Heroic → Relic → rakun); the git history is kept.
- `rakunctl versions <store> <appName>` lists the builds and branches of a GOG
  game, and `install` / `update` of one GOG game take `--build ID` and
  `--branch NAME`: the game stays on that version (pinned) until it is updated
  by name. Epic, Amazon and Zoom have no equivalent in the backend.
- Games already on the disk can be imported: `rakunctl import <store> <appName>
<folder>` and, in the web, "Import from a folder" in the sheet of a game that
  is not installed (GOG, Epic and Amazon; Zoom has no import). Both check that
  the game really ended up installed, because rakun answers "done" either way.

### Changed

- **relicd is now called rakun** and `relicctl` is `rakunctl`. Clean break, no
  migration: paths `~/.config/rakun`, `~/.cache/rakun`, `~/.local/state/Rakun`,
  `~/.local/share/rakun`, `~/Games/Rakun`; `RAKUN_*` variables; `x-rakun-token`
  header; `getRakunVersion` and `resetRakun` channels.
- Repairing a game repeats the whole Steam integration of an install: the
  runner, the shortcut (added only if it is missing, so a deleted one comes
  back, and a game that never got in is added), the prefix and the covers. The
  properties window of Steam opens only when the shortcut was really added.
- One runner for every game: all the logic of the three stores is in
  `mount/scripts/Launcher_games.bat` (**FranjeGueje runner**, starting at v1),
  rewritten at every start, and the `.bat` of each game only sets `STORE` and
  `IDGAME` (plus `GAMEFOLDER` and `GOGUSER` on GOG) and calls it. A new version
  of the runner reaches every game at once. `eos-overlay.bat` moves to
  `mount/scripts/` too. The `.bat` files made by the earlier runner (v5) keep
  working: they carry their own logic.
- The mount inside each game's prefix is now `C:\Launchers`
  (`drive_c/Launchers`, `%LAUNCHERS%` in the `.bat` files, runner version 5).
  Existing Steam shortcuts and prefixes are not migrated: delete the old shortcut
  and reinstall the game.
- The web uses the rakun mascot as its icon (centred in the top bar) and the red of its
  helmet as the accent colour, with the "Rakun" lettering next to it (drawn from
  the outlines of Lilita One, SIL OFL).
- A game with a Windows and a Linux build (GOG, Zoom) asks which one to install
  in the web: "Install Windows version" and "Install Linux version" replace
  the single install button, which always chose the Linux build. `GameInfo`
  has a new `is_windows_native` field. `rakunctl install` has the same choice
  with `--platform windows|linux`.
- Cancelling a download from the web deletes the files left half downloaded,
  like `rakunctl cancel --remove-files`; the downloads panel now asks first, as
  the game sheet already did.
- The SteamGridDB key screen of the web explains where to get the key and
  links to the page of the profile that shows it.
- The download language screen of the web can be used with a mouse or touch:
  ‹ › are buttons and there is an OK button.
- The login screen of the web has an OK button, with the paste button right
  next to it.
- Everything is now in English: `rakunctl` (help, messages, errors, the `reset`
  confirmation is `[y/N]`), the scripts and the documentation. The Spanish
  README is `README.es.md`; `GUIA.md` is now `GUIDE.md`.

### Fixed

- The EOS Overlay script (**FranjeGueje EOS Overlay Installer**, v1) no longer
  trusts a game's overlay folder to be full: it runs `enable` first and, if its
  output has an ERROR (legendary can think an empty folder is installed), it
  removes and installs the overlay again; otherwise it only updates it.
- Uninstalling a game of Amazon now shows at once as not installed in the
  library (it needed a manual refresh).

## 0.1.0 — Headless

### Added

- **relicd**, a backend-only fork of Relic: a Node service with no Electron and
  no window, with its own identity (`~/.config/relicd`, `~/.cache/relicd`,
  `~/.local/state/Relicd`, `~/.local/share/relicd`, `~/Games/Relicd`).
- **Local HTTP API** (`127.0.0.1`, port 17370 or `RELICD_PORT`): `POST
/api/<channel>`, `GET /events` (SSE) and `GET /health`. Token in
  `~/.config/relicd/api.json` (mode 0600), the machine's own `Host`, an `Origin` only
  from relicd's own web and an allow list of channels and events. Documented in
  `API.md`.
- **`getLibrary`**: the library of one or all stores with install state and
  overrides (the frontend used to read it from the stores).
- **`refreshLibrary` does not block**: it answers at once, refreshes in the
  background, joins requests for a store that is already refreshing and fires
  the `refreshLibrary` event when done; `getRefreshingLibraries` tells which
  stores are refreshing.
- **`steamgriddb.hasApiKey` and `steamgriddb.setApiKey`** exposed in the API:
  without a SteamGridDB key no artwork is downloaded when a game is added to
  Steam.
- **`getAccounts`**: who is logged in to each store and under what name, with
  no network.
- **Window-less login**: `getLoginInfo` returns the login URL and `submitLogin`
  takes the final address, Epic's JSON or the bare code.
- **`scripts/package.sh`**: `relicd-<v>-linux-x64.tar.gz` (+ `.sha256`) with the
  esbuild bundle, the helper binaries and its own Node 24 checked against its
  checksum. **`scripts/install.sh`** installs it to `~/.local/opt/relicd`
  without creating any service. **`scripts/smoke.sh`** checks a running relicd.
- **`relicctl`**, a command line client (it only talks HTTP to relicd):
  `status`, `login`/`logout`, `import-relic`, `library`, `refresh`,
  `install`/`update`/`repair`/`uninstall` (they wait until done; `--lang`,
  `--skip-dlcs`, `--no-wait`), `queue`, `pause`/`resume`/`cancel`, `config`,
  `logs`, `cache clear`, `reset`, `events`, `call` and `--json`. The stores come
  from `getStores`, so adding one does not touch `relicctl`.
- **`relicctl start`, `stop` and `-s`**: start and stop relicd without systemd.
  `relicctl -s <command>` starts it if stopped and stops it afterwards; with
  several `-s` at once the last one stops it, and only if a `-s` started it.
  With relicd stopped, every other command says so.
- **Validated global settings** (`setSetting`/`writeConfig`): an unknown key, a
  wrong type, an unsupported language, a `maxWorkers` out of range or a missing
  path answers `500` with the reason. Changing `language` takes effect at once.
  `getMaxCpus` gives the most `maxWorkers` can be.
- **`clearCache`, `resetRakun` and `stopRelicd`** in the API. `resetRakun`
  forgets sessions, settings and the queue (not the installed games nor
  `api.json`) and stops relicd.
- **Download queue**: `clearFinishedDMQueue`, and a failure keeps its reason in
  `DMQueueElement.error` (`relicctl install` prints it instead of "see the
  logs").
- **Generic `getStores` and `logout(runner)`**, `getLogContent` and
  `importSessionsFromRelic` (copies the sessions of `~/.config/relic`), and the
  GOG private branch with the helper binary versions.
- **DLCs are installed by default** on Epic and GOG (`installDlcs` omitted = all,
  `[]` = none, a list = only those on GOG).
- **Zoom (experimental)**: relicd checks there is a screen before downloading a
  Windows game and fails at once without `DISPLAY`, with the X server gone or in
  game mode. The docs explain that those installers need a screen.
- **A store is a folder plus one line in the registry** (`Store` descriptor),
  with a test contract for all of them and a guide in `AGENTS.md`.
- **relicd's own web** (`web/`, React bundled with esbuild): library, downloads,
  accounts (login by pasting, with a clipboard button) and settings, usable with the
  mouse, the keyboard or a gamepad, with a one-row header and a ☰ menu on narrow screens.
  It began as a copy of the `relicd-client` interface, which is now **archived and no
  longer maintained**. Served by `GET /` (the token and the mode travel in `<meta>`);
  without the `web/` folder relicd works the same.
- **Who can open the web**: `local` (default), `network` (the whole network, **without
  protection**, home or experimental use only) and `off`. Chosen with `relicd --web=…
--port=…` (which `relicctl start` forwards), `RELICD_WEB`/`RELICD_PORT` or the
  `webAccess` setting. In `network` relicd only accepts its own `Host`, and settings,
  stop, reset, folders, logs, secrets and moving or importing games only answer to this
  machine. It warns in the log, in `relicctl start`/`status` and with a banner in the
  web; `/health` reports `web`.
- **`listFolders`**: lists the folders of a path (to pick folders with a gamepad or the mouse).

### Changed

- `ipc.ts` moves to in-memory registries instead of `ipcMain`; the handlers of
  `main.ts` are split into `relic/api/` and start-up lives in `relic/daemon.ts`.
- GPU through `lspci` (was `app.getGPUInfo`); `online_monitor` without `net`;
  `os.release()` instead of `process.getSystemVersion()`.
- Dialogs are logged and published as a `showDialog` event; `askQuestion` always
  picks the first (safe) option.
- **Installing a game that is already installed is refused** (`500 already
installed: use repair or update`; `relicctl` says it is already installed) instead
  of downloading it all again.
- **Faster, lighter start-up**: `syncMountBin` no longer reads and hashes the
  Windows binaries (56 MB) on every start, it only compares size and date. Cold
  start from 0.24 s to 0.13 s and memory peak from 128 MB to 81 MB.
- One tarball per architecture: `pnpm package [x64|arm64|all]` builds
  `relicd-<v>-linux-<arch>.tar.gz`, each with only its own binaries and Node.
- No translations: the daemon's messages are in English; `language` only picks
  GOG's default language.
- `relicctl` commands no longer say "is it running?": they say "relicd stopped"
  and how to start it.
- The API drops the per-store channels (`login`, `authGOG`, `isLoggedIn`,
  `logoutLegendary`…): use `getStores`, `getAccounts`, `getLoginInfo`,
  `submitLogin` and `logout`.

### Fixed

- **Zoom: an aborted download left a truncated installer** that the next attempt
  took for the finished one. It is now downloaded to a `.part` file and renamed
  only when complete.
- **`getLibrary` for Epic and Amazon** did not show an install or uninstall
  until the next refresh (their stores are only rewritten by a refresh); it now
  fills in the state each manager keeps.
- **Repairing a Linux native game** created a `.bat` it does not need (its
  shortcut points to `start.sh`); it is now skipped.
- **Reinstalling a game whose prefix was kept** failed with `EEXIST` when
  creating the prefix links and skipped the rest of the preparation. It now
  replaces the existing links.
- **Zoom: a Windows installer that failed was taken as installed**: the game was
  recorded and added to Steam without existing. The install now ends in error.
  Logging out of Zoom also empties the cached library.
- **GOG: installing with no language sent the text "undefined" to gogdl**, which
  crashed. It now defaults to `en-US` and stores the language used
  (`relicctl install --lang`).
- **Reinstalling a GOG or Zoom game (and Epic's third-party ones) repeated its
  record** in `installed.json`: three installs left three entries, and uninstalling
  removed only one, so the game still looked installed. There is now one entry per
  game, uninstalling removes them all and a refresh cleans up the duplicates that
  already exist. Also, removing a third-party game that was not in the list deleted
  the last one.
- **Epic ignored `installDlcs`** and always passed `--skip-dlcs`.
- **`checkGameUpdates` reported games the automatic update had already queued**,
  and Amazon with no session was logged as an error (it is the normal state).
- **An empty Proton folder is now really «automatic»**: GE-Proton is looked for when it is
  needed, not only when the settings are created. Before, a GE-Proton installed later left
  the prefix uninitialised (`No GE-Proton configured`).
- **A failure to start (a busy port, say) is written to relicd's log**, and `relicctl
start` says which file to read (`relicctl logs` needs relicd running).

### Removed

- Electron, the React frontend, the preload, the main window, the tray,
  `images_cache`, Playwright, electron-vite, electron-builder and their
  dependencies; the window, shortcut, clipboard, gamepad and zoom channels.
- i18next and the translations (`public/locales`), `easydl`, `tmp`, `undici`
  (the proxy is handled by `NODE_USE_ENV_PROXY`), the e2e support inherited from
  Relic, the `@types/node` patch and unused code. `node_modules` goes from
  605 MB to 171 MB.
- The native Linux Comet (`getCometVersion`, `altCometBin`, the `comet` log);
  `comet.exe` stays, as it runs inside the prefix.
- Per-game settings (`GameConfig`, `GameSettings`), the Cyberpunk mods, GOG cloud
  saves and the UI-era channels.
- The Windows arm64 `.exe` files (nothing used them).
- `zod` (legendary's branded command types are now an own module,
  `backend/schemas.ts`), unused exports and types, and 140 of the 279 eslint
  warnings (the ones in tests, which use loose mocks, and the mechanical ones in
  the code).
