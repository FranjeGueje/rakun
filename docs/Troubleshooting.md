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

## Games in Steam

### A Windows game does nothing in Steam

Force GE-Proton in the game's Steam properties (rakun does not set the compatibility tool) and check the prefix in `compatdata/<id>`.

### The runner's window closes too fast to read it

Set `LOG_TO_FILE=1` in `~/.local/share/rakun/mount/scripts/Launcher_games.ini` and launch the game again: the output of the runner is in `~/.local/share/rakun/mount/logs/<game name>.log`. See [Steam integration](Steam-Integration.md#runner-options-launcher_gamesini).

### `No GE-Proton configured` in the log (older versions)

A GE-Proton installed later was never looked for. Update rakun, or set it: `rakunctl config protonPath <folder>`.

### Zoom's Windows install fails at once

It needs a screen (`DISPLAY`): use desktop mode, not game mode, and restart rakun after switching.

## The web

### It shows the old design after an update

The installed copy is `~/.local/opt/rakun/web`. Reinstall (`scripts/install.sh`) or copy `build/web/.` there, then press Ctrl+F5.

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
