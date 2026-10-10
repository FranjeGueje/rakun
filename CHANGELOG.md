# Changelog

The history of Relic (and of the Heroic cleanup) lives in the `upstream` repository. The detailed notes of the versions before this first release are in the git history of this file.

## Unreleased

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
