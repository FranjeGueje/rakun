# Changelog

The history of Relic (and of the Heroic cleanup) lives in the `upstream` repository. The detailed notes of the versions before this first release are in the git history of this file.

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
