# Troubleshooting

Start with `rakunctl status`: it says whether rakun is running and what is missing. The logs are listed at the end of this page.

## rakun does not start or answer

### `rakunctl` says "rakun is stopped"

rakun is not running. Start it with `rakunctl start`.

### `rakun did not start (code 1)`

Read the log it points to (`~/.local/state/Rakun/logs/rakun.log`). The reason is the last `failed to start` line. A busy port shows as `EADDRINUSE`: pick another with `--port`.

## The web or the API answer `403`

### `Host "…" is not allowed`

In `network` mode, open the web by the IP or the name of the machine, not by another name (a router alias is not in the list).

### `can only be called from the machine rakun runs on`

In `network` mode, settings, folders, logs and a few more channels only answer to the machine itself. Open `http://127.0.0.1:<port>` there. Using the machine's own LAN IP does not count.

## A store says "session expired"

`rakunctl status` (and the Accounts screen of the web) shows `session expired, log in again (the games are kept)` when a store refused the login you had: the token ran out or was revoked. Nothing is deleted and you are not logged out. Your library and the installed games stay as they were, and what is in Steam keeps working. Install, update and repair say that the session has expired until you log in again: `rakunctl login <store>` (or select the store in the web). `rakunctl status --check` asks GOG, Zoom and itch.io if the session still works, and clears the mark if it does.

## Games in Steam

### A Windows game does nothing in Steam

Force GE-Proton in the game's Steam properties (rakun does not set the compatibility tool) and check the prefix in `compatdata/<id>`.

### The runner's window closes too fast to read it

Set `LOG_TO_FILE=1` in `~/.local/share/rakun/mount/scripts/Launcher_games.ini` and launch the game again: the output of the runner is in `~/.local/share/rakun/mount/logs/<game name>.log`. See [Steam integration](Steam-Integration.md#runner-options-launcher_gamesini).

### `No GE-Proton configured` in the log (older versions)

A GE-Proton installed later was never looked for. Update rakun, or set it: `rakunctl config protonPath <folder>`.

### Zoom's Windows install fails at once

It needs a screen (`DISPLAY`): use desktop mode, not game mode, and restart rakun after switching.

## itch.io

### `invalid redirect URI` on the itch.io page

The OAuth application has to have `http://127.0.0.1/itch/callback` as its callback URL (the port does not have to match, the scheme, the host and the path do). It is a setting of the application, in itch.io → Settings → OAuth applications, not of rakun.

### The browser comes back to a page that does not load

itch.io sends it to `127.0.0.1` on the port of rakun's API, which only exists on the machine rakun runs on. From another machine, copy the address the browser ended on and paste it into `rakunctl login itch` (or the web): it works the same.

### `That key or token does not have the permissions rakun needs` or `Invalid scope`

The login by OAuth asks for `profile:me`, `profile:owned`, `profile:collections` and `game:view:uploads`, and itch.io grants no others. Log out and in again (`rakunctl logout itch`, `rakunctl login itch`). A key made by `butler login` is not valid either: create one at itch.io → Settings → API keys.

### The collections are empty or the games of a collection do not appear

The games inside a collection (and installing a game that is not in the library, `rakunctl install itch <id>`) need an API key with full access: the login by OAuth cannot read them. Log in with the second way, pasting the key.

### `This login is not the one rakun started, or it took too long`

The login has to end in 10 minutes, and a second `login itch` replaces the first. Start it again.

### A game installs but the install ends in an error: "there is no executable to run"

butler found nothing it can run in the install (the game may be a `.zip` inside another one, an installer, or for another platform). The game stays installed: repair it, or install the other build (`--platform windows|linux`).

## Updating rakun

### `This rakun is not in ~/.local/opt/rakun, so it was not installed by install.sh`

`rakunctl self-update` only replaces an install made by `install.sh`. A rakun run from a checkout, or inside an AppImage or another client, is updated the way it was installed.

### `… has no self-update. Install the new one by hand once`

The version you have came without `install.sh` in its folder (it is older than `self-update`). Run the quick install of [Getting started](Getting-Started.md#1-install) once; after that `self-update` works.

### `GitHub refused the request` or `Could not reach GitHub`

The GitHub API limits requests without an account, or there is no network. Try again later.

### `There is no published build for arm64`

Releases only carry the x64 tarball. On arm64 build your own (`pnpm package arm64`, see [Development](Development.md)) and install it with `scripts/install.sh`.

## The web

### It shows the old design after an update

The installed copy is `~/.local/opt/rakun/web`. Update rakun (`rakunctl self-update`), reinstall (`scripts/install.sh`) or copy `build/web/.` there, then press Ctrl+F5.

## Where to look

| What               | Where                                                             |
| ------------------ | ----------------------------------------------------------------- |
| General log        | `~/.local/state/Rakun/logs/rakun.log` (also why it did not start) |
| A store's log      | `~/.local/state/Rakun/logs/runners/<store>.log`                   |
| An install's log   | `~/.local/state/Rakun/logs/games/<app>_<runner>/install.log`      |
| Any of them        | `rakunctl logs [store [app]] [--type install]`                    |
| Background service | `journalctl --user -u rakun -f`                                   |

More paths in [File locations](File-Locations.md).

---

See also: [Getting started](Getting-Started.md) · [Helper binaries](Helper-Binaries.md)
