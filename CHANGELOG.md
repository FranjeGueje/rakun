# Changelog

The history of rakun before its first release (the Heroic cleanup and Relic) lives in the `upstream` repository. The detailed notes of the versions before this first release are in the git history of this file.

## 0.4.0 — itch.io

A new store, itch.io, and the first one that is not run by a client of its own: it goes through butler, itch's own tool. This version also carries what 0.3.2 prepared, which was never tagged.

### Added

- itch.io (`itch`): log in, library, install, repair, update and uninstall, through `butler daemon` (butlerd), which rakun starts when it needs it and which stops with rakun.
  - **Two ways to log in**, told apart in `rakunctl login` and in the web:
    1. Your library, by authorizing rakun in the browser (OAuth with PKCE, no secret). rakun asks for the minimum: `profile:me`, `profile:owned`, `profile:collections` and `game:view:uploads`. itch.io sends the browser back to `GET /itch/callback` on rakun's own API and the login ends by itself, so `rakunctl login` and the web only wait; from another machine, the final address can be pasted. That route needs no token (it is the user's browser): the one-time `state` that rakun made up is the proof, and a wrong one does not cancel a login that is going on. It also works with the web turned off. rakun keeps the token only to revoke it when the user logs out. The redirect URI `http://127.0.0.1/itch/callback` has to be registered in the OAuth application.
    2. Your library and your collections, by creating an API key with full access (itch.io → Settings → API keys) and pasting it. It gives rakun full access to the account, which is why it is the second way. The key `butler login` makes cannot read a library, and a key with too few permissions is refused with a message that says so.
  - The library is what the user owns or has claimed. **With an API key** it also has the games in the user's collections, and a free game that is in none of the lists installs by its number: `rakunctl install itch <id>`. itch.io grants `collection:view` and `game:view` to nobody over OAuth, so with the first way collections are listed but not their games, and installing a game that is not in the library may not work.
  - Like GOG, a game with a Windows and a Linux build lets the user choose; the other operations keep that choice. A move of the install and the import of a folder are not supported, and itch.io games have no pinned versions: butler decides what an update is.
  - Pausing or cancelling a download stops butler (`Install.Cancel`, as the other stores abort their tool) and removes what it had written; resuming starts the download again, because butler keeps nothing of a cancelled install.
  - The executable of a game is what `butler configure` finds in the install, for the chosen platform. A Linux game gets a `start.sh` that runs it (as GOG's does) and a Windows game goes through the runner. A game with nothing to run is installed, so that it can be repaired or uninstalled, but the install ends in an error and it is not added to Steam. A game that is an installer (`Setup.exe`) is installed, but it is the installer that Steam would run.
  - Logging out revokes the token, forgets the profile in butler and clears the cache of the library, as the other stores do.
- The helper `butler` 15.32.0 (x64 and arm64, checked by sha256, with `7z.so` and `libc7zip.so`, which it loads from next to itself: it counts as installed only with the three). `rakunctl helpers update` downloads it from itch's server, and the `-full` tarballs carry it with the texts of the licences of the three. `--latest` does not move it (itch's server has no release list rakun reads).
- The runner has an `itch` block: the `.bat` of an itch.io game sets `IDGAME` to its executable (`<folder>\<path>` under `c:\games`) and the runner goes to its folder and runs it, waiting for it to close. An update that moves the executable makes rakun write the `.bat` again. The runner is still v1.
- `umu` prepares the prefix of an itch.io game as store `itchio`.
- Zoom's Windows games have two ways to install, told apart by `installMode` in `install` (`rakunctl install zoom <id> --mode steam|interactive`, and two buttons in the web, «Add to Steam» and «Install now»; the stores say it in `caps.installModes`):
  - `steam` (the default, needs no screen): rakun downloads the installer into the game's prefix (`C:\zoom_installer`) and adds the game to Steam; the first Play opens the installer's window and the next ones start the game.
  - `interactive`: rakun runs that same `.bat` now, with its window (needs a desktop session and `protonPath`), so the game is installed when the command ends.
- `getLoginInfo` can carry `callback` (the browser comes back to rakun, so a client waits for the session) and `alternative` (a second way to log in, with its own page).

### Changed

- The covers of the web: a picture whose shape is more than 15% away from the card's (3:4) is shown whole over a blurred copy of itself, instead of being cut to fill the card (itch.io only has a wide cover, which looked zoomed in). The ones that fit are filled as before.
- Zoom's Windows games go through the runner like the other stores (`STORE=zoom`, with `INSTALLER` and, when rakun installs now, `INSTALL_ONLY` in the game's `.bat`). Their Steam prefix is still the game's own folder, and a native Linux game still starts its `start.sh`. The `directLaunch` capability now means «the prefix is the game's folder».
- The logs of a game, the one of the runner (`LOG_TO_FILE=1`) and Comet's `comet.log`, go to `C:\logs` of the game's own prefix instead of the shared mount, so two games no longer write on each other. Logs already in `mount/logs` stay where they are. A `.bat` without `GAMENAME` no longer makes a log name with a `\` in it.
- The runner is split: `Launcher_games.bat` keeps what every game shares (options, header, log) and calls `store_<store>.bat` (`store_legendary.bat`, `store_gog.bat`, `store_nile.bat`, `store_itch.bat`, `store_zoom.bat`), one per store, written next to it at every start. The `.bat` of a game does not change. In the code each store is a module of `rakun/runner/`, and the stores with a runner are one list (`STORE_LINES`), so the dispatch and the scripts cannot drift apart.
- The `.bat` of a game never gets a path for a name: a `/` in the title is replaced (it failed, or wrote somewhere else). Titles that were already fine keep their file.
- `windowify` says it has nothing to translate for a store that keeps no installed file, instead of warning that it is not implemented.
- The error of `getInstallInfo` is logged under the prefix of its own store (it fell back to GOG's).
- `rakunctl cache clear` also clears the itch.io library.
- The folder of the itch.io data (`~/.config/rakun/itch_store`, with butler's database and the OAuth token) is for the user only (mode 0700).
- `pnpm check-helper-binaries` compares butler with the latest one of itch's server.
- Helper programs that change: if a store's tool prints something rakun does not understand, rakun says so (in the log, `rakunctl status` and `rakunctl helpers`) and keeps what it had instead of deleting it. At start it also warns when a helper is not the version rakun was tested with. Tests built from what the pinned helpers really print fail on purpose when a helper is bumped without checking it again (`scripts/capture-helper-fixtures.sh`, see `docs/Helper-Binaries.md`).
- Code cleanup: dead code removed, files with a misleading name renamed, and the big `utils.ts` and Zoom's install split into smaller pieces. Nothing changes for the user.

### Removed

- The helper `zoom-platform.sh` (and its entry in `rakunctl helpers`, `THIRD_PARTY` and the packages): Zoom's installer cannot run silent, so rakun no longer needs Zoom's script. The search for the executable of a Windows game moved to the runner.
- The detection of DOSBox games installed with Zoom's Windows installer. It copied their files and set the game as a Linux one with `dosbox` as its executable, but there was no `start.sh` for Steam to launch, so it did not work; those games now go through the runner and Proton like the others.

### Fixed

- Uninstalling a Zoom game that the web still showed as installed did nothing (the installed list no longer had it, and the saved library kept the green mark). It now clears the mark, in the saved library too, so it survives a restart without network.
- A failed install, update, repair or uninstall was reported as done when the store's tool ended with an error (for example GOG without disk space): the game was saved as installed and added to Steam with no files. Now the error is shown and nothing is saved. GOG also needs files in the game folder, and Amazon needs `nile` to have recorded the install.
- Sessions are safer. Without a network no session is lost. Pasting a wrong login in Zoom no longer replaces the good session. A login only counts when there is a real session behind it. A broken account file no longer hides the other accounts. Logging out of Epic or Amazon now says so when it did not really happen. `nile` can no longer empty its list of installed games when a game is moved, and secrets are hidden better in the logs.

## 0.3.2 — Comet starts from its own script

### Added

- `PLAYTASK` in the `.bat` of a GOG game (written as `0`): the index of the play task `gogdl` starts, passed as `--prefer-task`. `0`, a missing value or anything that is not a number leaves `gogdl` with the task GOG marks as primary. It is for a game whose primary task is a launcher that starts the game twice or ends before it (Cyberpunk 2077 with `--launcher-skip`: set `PLAYTASK=1` to start `bin\x64\Cyberpunk2077.exe` directly). The `.bat` is rewritten when the game is added to Steam again, so a value edited by hand is lost then.

### Changed

- The runner of a GOG game no longer starts Comet itself: it calls `mount/scripts/comet.bat` with the GOG user, a new script that rakun rewrites at every start (like the runner). It updates the files of `gog_store`, makes sure the `GalaxyCommunication` service exists, and leaves Comet running. The call is made from the runner (not started apart), so Comet stays in the console of the runner and its window lasts as long as Comet, even if the launcher of the game ends first. The runner is still v1.
- The log of Comet is `mount/logs/comet.log` (it was discarded).
- `gogdl` reads its auth file from `%LAUNCHERS%\gog_store\auth.json`.

### Removed

- `install-dummy-service.bat` is no longer run and is no longer one of the files rakun expects from the Comet helper.

## 0.3.1 — Steam integration without a desktop session

### Fixed

- A game was not added to Steam when rakun ran as a service of a systemd user unit (for example the one of Invasor): the daemon lacks variables such as `KDE_SESSION_VERSION`, so `xdg-open` picked a missing handler (`kfmclient` on KDE) and failed silently with exit code 0. Steam never received the `steam://addnonsteamgame` URL and the add ended in a timeout. The URL is now opened with `gio open`, which does not depend on the desktop environment, and `xdg-open` is only the fallback.

## 0.3.0 — Runner options and self-update

rakun can update itself, and the runner of the games has options of its own.

### Added

- `rakunctl self-update [--check] [--force]`: installs the newest GitHub release over `~/.local/opt/rakun` (checksum required), stopping rakun first and starting it again if it was running; a busy rakun is not stopped without `--force`. `--check` only says if there is a new version. It only touches an install made by `install.sh` and only x64 is published. rakun itself never asks GitHub. The tarball now carries `install.sh`, which `self-update` runs: an older install must be updated by hand once.
- The variable `RAKUN_RELEASES_URL` points `self-update` at another release, to test it.
- `~/.local/share/rakun/mount/scripts/Launcher_games.ini`: options of the runner that rakun creates once and never overwrites (the `.bat` of each game does not change, so this is where a new runner reads its options). `SHOW_HEADER` (default `1`), `SHOW_VERSIONS` (default `0`: the versions of comet, gogdl and nile and the status of legendary are no longer printed, which makes a launch faster) and `LOG_TO_FILE` (default `0`: the output goes to `mount/logs/<game name>.log`).
- The `.bat` of a game sets `GAMENAME`, the title of the game; a game added earlier gets it when it is repaired, and until then its log is named `<store>-<id>`.

### Changed

- A game is no longer recognised in Steam by its title (the user may rename the shortcut, and another launcher may have a game with the same name). It is the shortcut with the `steamAppId` saved in `~/.config/rakun/steam_shortcuts.json`, or the one that runs the game's runner (so a reinstall reuses the shortcut an uninstall left in Steam). A game not in that file is added even if Steam has one with its title.
- Adding a game to Steam fails at once when Steam has no `userdata` folder, instead of waiting for the timeout. Steam adds the shortcut with no dialog; the messages and docs no longer mention one.

## 0.2.0 — Less inherited code

A cleanup release: rakun only authenticates, downloads and installs, and adds to Steam, so what it did not need from Heroic and Relic is gone.

### Removed

- `importSessionsFromRelic` and `rakunctl import-relic`: rakun shares nothing with Relic.
- API channels no client used: `getKnownFixes`, `getPrivateBranchPassword`, `setPrivateBranchPassword`, `isNative`, `getEpicGamesStatus`, `get-connectivity-status`, `set-connectivity-online`, `checkDiskSpace`, `changeInstallPath`, `getSystemInfo`, `getLegendaryVersion`, `getGogdlVersion` and `getNileVersion`, and the `connectivity-changed` event.
- Epic games managed by EA App or Ubisoft Connect are no longer listed: rakun only fetched the launcher's installer and never installed the game.
- The `json5` dependency.

### Changed

- The download queue is now `~/.config/rakun/download-manager.json`. A queue in the old `store/` folder is not migrated.
- rakun no longer creates `icons/`, `tools/` or `store/` in `~/.config/rakun`.
- The extra information of an Epic game (description, requirements) is asked for in `en-US`.

### Added

- The web shows the version of rakun at the end of the menu.

## 0.1.0 — First release

rakun is a headless Linux service that logs in to your game stores, installs your games and adds them to Steam. It never launches a game: Steam does.

### What it does

- **Stores:** Epic Games, GOG, Amazon Games and Zoom Platform (Zoom is experimental). Login is by pasting the address or code your browser ends on; there is no embedded browser.
- **Games:** library, download queue (pause, resume, cancel), install, update (one game, a store's or all), repair and uninstall. A game with a Windows and a Linux build asks which one to install, DLCs are installed by default, and a game already on the disk can be imported without downloading it. On GOG a game can be pinned to a build or branch.
- **Steam:** when an install finishes, rakun adds the game to Steam (shortcut, Proton prefix and cover art from SteamGridDB). One shared runner script drives every Windows game.
- **Clients:** rakun's own web (`http://127.0.0.1:17370`, mouse, keyboard and gamepad) and `rakunctl`, a command line client that can also start rakun only while a command runs (`rakunctl -s`) or install it as a systemd user service.
- **Helper programs:** legendary, gogdl, nile, comet and umu are downloaded on demand, checked by `sha256` (`rakunctl helpers update`), so the package is small. rakun starts without them and says what is missing.

### Security

- A local HTTP API on `127.0.0.1` protected by a token (`~/.config/rakun/api.json`, mode 0600), with `Host` and `Origin` checks against DNS rebinding.
- The web can be opened to the network (`webAccess=network`) **without any protection**, for home use only; settings and other sensitive channels still answer only to the machine itself.
- `scripts/install.sh` refuses to install a tarball without a matching `.sha256`.

### Under the hood

- A backend-only fork of Relic (itself a Linux-only fork of Heroic Games Launcher): no Electron and no window of its own, with an identity of its own (`~/.config/rakun`, `~/.local/share/rakun`, `~/Games/Rakun`). Everything is in English.
- Adding a store is a folder plus one line in a registry, checked by a shared test contract.
- GitHub Actions run the checks on every push, and a `vX.Y.Z` tag on `master` publishes the release.
