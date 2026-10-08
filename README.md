# rakun

[Español](README.es.md)

rakun is a headless fork of [Relic](https://github.com/FranjeGueje/Relic) (itself a
Linux-only fork of [Heroic Games Launcher](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher)):
Heroic → Relic → rakun. The git history of all three is kept in this repository, and
the people behind it are listed in [AUTHORS](AUTHORS).
It is **backend only**: a Node service, no Electron and no window of its own. A local
HTTP API lets a client (rakun's own web, `rakunctl`, or the
[Invasor](../proyecto-invasor/) module `invasor-relic`) log in
to the stores, list the library and install, update, repair and uninstall games.
`relicd-client`, the console-mode Electron app that was the first client, is **archived
and no longer maintained**: rakun's own web replaces it.

rakun is **not** a launcher. When an install finishes it runs the Steam integration
(shortcut, prefix, grids) and the game shows up in Steam. Steam is the launcher.

> The project is an experiment. It has its own identity and shares nothing with Relic:
> `~/.config/rakun`, `~/.cache/rakun`, `~/.local/state/Rakun`, `~/.local/share/rakun`
> and `~/Games/Rakun`. Inside each game's Proton prefix the mount is called
> `C:\Launchers` (`drive_c/Launchers`; the runner uses that name via `%LAUNCHERS%`).

---

## Features

- Login: Epic Games, GOG, Amazon Games, Zoom Platform (paste the code or address your
  browser ends on; no embedded browser)
- A web on `http://127.0.0.1:17370` (library, downloads, accounts and settings; made for the mouse, the
  keyboard and a gamepad work too), source in `web/`
- Library, download queue (pause, resume, cancel), install, update, repair and uninstall
- `rakunctl`, a command line client for all of it, and a way to start rakun only
  while a command runs (`rakunctl -s`)
- Global settings (install path, GE-Proton, workers, language…) with validation
- Automatic Steam integration (shortcuts, grids, prefixes)
- GOG achievements (experimental, via [Comet](https://github.com/imLinguin/comet))
- Linux native game support (GOG)

The API (connection, channels, login flow and events) is documented in [API.md](API.md); a step-by-step test walkthrough (in Spanish) is in [GUIDE.md](GUIDE.md).

---

## rakunctl

`rakunctl` talks to a running rakun over HTTP (it reads `~/.config/rakun/api.json`;
`RAKUN_API_FILE` points it at another one). Stores are `epic`, `gog`, `amazon` and
`zoom`; `--json` prints for scripts.

| Command                                                               | What it does                                                                                                                                                                                                     |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start` / `stop [--force]`                                            | start rakun in the background / stop it                                                                                                                                                                          |
| `start [--web local\|network\|off] [--port N]`                        | who can open the web (default: the `webAccess` setting) and the port                                                                                                                                             |
| `status`                                                              | version, sessions, queue (or "rakun parado")                                                                                                                                                                     |
| `login <store>`, `logout <store>`                                     | log in (paste what the browser ends on) / out                                                                                                                                                                    |
| `import-relic`                                                        | copy the sessions of Relic (`~/.config/relic`)                                                                                                                                                                   |
| `library [store] [--installed]`, `refresh`                            | list the library / refresh it and wait                                                                                                                                                                           |
| `install <store> <app> [--path] [--lang] [--platform windows\|linux]` | install (every DLC unless `--skip-dlcs`; `--platform` picks the build of a game that has both, Linux by default; on GOG `--build ID` / `--branch NAME` pick a version, see `versions`); waits unless `--no-wait` |
| `versions <store> <app>`                                              | list the builds and branches of a GOG game                                                                                                                                                                       |
| `import <store> <app> <folder> [--platform windows\|linux]`           | register a game that is already in a folder, without downloading it (not Zoom)                                                                                                                                   |
| `update [store [app]]`                                                | update one game, a store's games, or every game with a new version                                                                                                                                               |
| `repair`, `uninstall <store> <app>`                                   | the same, one game                                                                                                                                                                                               |
| `queue [clear]`, `pause`, `resume`, `cancel`                          | download queue (`cancel --remove-files` deletes what was fetched)                                                                                                                                                |
| `config [key [value]]`                                                | list, read or change the global settings                                                                                                                                                                         |
| `logs [store [app]] [--type T]`                                       | rakun's log, a store's or one game's                                                                                                                                                                             |
| `cache clear [store]`, `reset [--yes]`                                | empty library caches / forget sessions and settings (stops rakun)                                                                                                                                                |
| `events`, `call <channel> [json]`                                     | follow the events / call any exposed channel                                                                                                                                                                     |

`-s` runs one command with rakun up even if it was stopped, and stops it afterwards
(see Installation). The channels behind each command are in [API.md](API.md).

---

## How Steam Integration Works

rakun never launches games. Every game is added to Steam as a non-Steam shortcut,
and the user launches everything from Steam.

### Installation flow

```
Game install completed
       │
       ▼
  ┌─ is the game already tracked in Steam? ──Yes──► Skip (already done)
  │
  No
  │
  ▼
  ┌─ is it a Linux native game? (GOG)
  │
  ├── Yes (Linux native) ──────────────────────── No (Windows/Proton)
  │                                                  │
  │  • Create symlink                                ▼
  │    ~/.local/share/rakun/games/<name>          • Create .bat runner file
  │    → actual install path                        ~/.local/share/rakun/runner/<Game>.bat
  │                                                  │
  │  • Use existing start.sh                        ▼
  │    as the Steam shortcut target               • Add to Steam via temp .desktop
  │                                                  + steam://addnonsteamgame
  │  • Skip: .bat, windowify, prefix                │
  │                                                  ▼
  │                                              • Windowify path transform
  │                                                Linux paths → c:\games\<name>
  │                                                Creates mount structure at:
  │                                                  ~/.local/share/rakun/mount/
  │                                                  │
  │                                                  ▼
  │                                              • Create symlink
  │                                                ~/.local/share/rakun/games/<name>
  │                                                → actual install path
  │                                                  │
  │                                                  ▼
  │                                              • Create Proton prefix
  │                                                Steam compatdata/<id>/drive_c/
  │                                                Runs umu-run to init prefix
  │                                                  │
  │                                                  ▼
  │                                              • Epic games only:
  │                                                run c:\Launchers\scripts\eos-overlay.bat
  │                                                through umu-run to enable the
  │                                                EOS Overlay in that prefix
  │                                                (installing it again if its
  │                                                folder is empty)
  │                                                  │
  │                                                ▼ (both flows converge)
  │
  └──────────────────────┬──────────────────────┘
                         │
                         ▼
                  Save shortcut to
                  ~/.config/rakun/steam_shortcuts.json
                         │
                         ▼
                  Download Steam grids
                  (header, portrait, hero, logo, icon)
                  from SteamGridDB
                         │
                         ▼
                  Open Steam properties dialog
                  steam://gameproperties/<id>
                         │
                         ▼
                  Done — the game appears in Steam
```

### Runner files

For Windows games, rakun creates a small `.bat` file per game. This is the file that
Steam launches. It only says which store and game it is, and calls the one runner
all the games share:

```
@echo off
rem FranjeGueje runner: the logic is in C:\Launchers\scripts\Launcher_games.bat
set "STORE=legendary"
set "IDGAME=<appName>"
call "C:\Launchers\scripts\Launcher_games.bat" %*
exit /b %errorlevel%
```

A GOG game also sets `GAMEFOLDER` (its folder in `c:\games`) and `GOGUSER` (the user
Comet logs in with). The runner, `Launcher_games.bat` (**FranjeGueje runner**, with
its version on the first line it prints), sets the environment, jumps to the block of
the store (`legendary`, `gog` or `nile`), checks its tools and launches the game
through the store's CLI. rakun writes it into `mount/scripts/` at every start, so a
new version reaches every game without regenerating their `.bat` files. The EOS
Overlay script lives next to it.

For Linux native GOG games, there is no `.bat`. rakun uses the `start.sh` script
that GOG ships with the game. Steam runs the shell script natively.

### Symlink structure

rakun maintains a directory of symbolic links at `~/.local/share/rakun/games/`
that map game folder names to their actual install locations:

```
~/.local/share/rakun/games/
├── Cyberpunk2077 → /home/user/Games/Rakun/Cyberpunk2077
├── Beat Cop     → /home/user/Games/Rakun/gog/Beat Cop
└── Fortnite     → /media/games/Fortnite
```

### Windowify (path transformation)

Windows store backends need to see paths as `c:\games\<name>` when running inside
a Proton prefix. rakun creates a mount structure at `~/.local/share/rakun/mount/`
that mirrors a Windows filesystem. Each store's config is symlinked into the mount,
and `installed.json` is rewritten with `c:\` paths.

### Prefix preparation

For Windows games, rakun creates a Wine prefix inside `compatdata/<steamAppId>/drive_c/`.
Two symlinks inside `drive_c` connect the mount and game structures:

```
drive_c/Launchers/  → ~/.local/share/rakun/mount/
drive_c/games/  → ~/.local/share/rakun/games/
```

If a GE-Proton is available, rakun runs `umu-run exit` to initialize the prefix. The
`protonPath` setting empty means **automatic**: the first `*proton*` folder of
`~/.local/share/Steam/compatibilitytools.d` that exists _when it is needed_ (so a
GE-Proton installed after rakun was first run is found too). Without any, the prefix is
left as plain folders and Steam's Proton creates it on the first launch.

**Steam compatibility tool:** rakun does **not** set it. For a Windows game, open its
properties in Steam → Compatibility → force GE-Proton, or Steam will try to run the
`.bat` runner as a Linux program.

### Steam shortcut registration

rakun uses the `steam://addnonsteamgame/` protocol to add games to Steam. It never
writes directly to `shortcuts.vdf`. The process:

1. Writes a temporary `.desktop` in `/tmp` (`Name` = game title, `Exec` = runner
   path) so the shortcut gets the game's name instead of the runner's filename,
   then opens `steam://addnonsteamgame/<desktop-path>` via xdg-open
2. Steam opens an "Add Non-Steam Game" dialog
3. rakun polls `shortcuts.vdf` every 1.5s for up to 15s
4. Once the game appears, it reads the assigned `steamAppId`
5. The temporary `.desktop` is deleted afterwards (Steam only keeps `Name` and `Exec`)
6. If Steam is not running or the dialog is not confirmed, the operation times out

### Grid artwork

After adding the game, rakun downloads artwork from SteamGridDB for all Steam users:

- Header/banner (460x215)
- Portrait (600x900)
- Hero banner
- Logo/wordmark
- Icon

A SteamGridDB API key is required in settings.

### Repair flow

If the repair completes without error, rakun repeats the whole Steam integration of an
install, even if the game was already added: it makes the `.bat` for the game
in `~/.local/share/rakun/runner/` again, adds the shortcut to Steam **only if it is
missing** (a deleted one comes back), sets the prefix up again and asks for the covers
again. The properties window of Steam opens only when the shortcut was really added.
A failure in the Steam part is logged and does not make the repair fail.

### Uninstall cleanup

When a game is uninstalled, rakun:

1. Deletes the `.bat` runner file (Windows games only)
2. Removes the symlink from `~/.local/share/rakun/games/`
3. Removes the Zoom prefix symlink (Zoom games only)
4. Deletes all 5 grid artwork files
5. Removes the shortcut from `steam_shortcuts.json`

The Steam shortcut itself in `shortcuts.vdf` is **not** removed by rakun.

---

---

## Installation

rakun has no public release yet. Build the tarball and install it:

```bash
git clone <this repository> rakun && cd rakun
pnpm install
pnpm download-helper-binaries    # public/bin, only needed for a -full tarball
pnpm package                     # dist/rakun-<version>-linux-x64.tar.gz and -arm64.tar.gz
scripts/install.sh                # picks the tarball of this machine from dist/
rakunctl helpers update           # then, the helper binaries (a -full tarball already has them)
```

`pnpm package x64` (or `arm64`) builds just one. The tarball carries its own Node, so
nothing else is needed on SteamOS, but **not the helper binaries** (legendary, gogdl, nile,
comet, umu…, see `THIRD_PARTY`): they are downloaded after installing, see _Helper binaries_
below. `pnpm package --full` also builds `rakun-<version>-linux-<arch>-full.tar.gz`, which
carries them, with the texts of their licences in `licenses/` (for a machine with no network;
`scripts/install.sh --full` installs it).
The installer puts it in `~/.local/opt/rakun` and links `~/.local/bin/rakun`. It creates **no
service** unless you ask for one (`rakunctl install-service`, below); otherwise start it
when you want it:

```bash
rakunctl start                                   # background, detached
rakunctl stop                                    # stops it (--force if a download is running)
rakunctl -s library                              # starts rakun only if stopped, runs the
                                                 # command, then stops it again
rakun                                           # foreground, Ctrl+C stops it
systemd-run --user --unit=rakun ~/.local/opt/rakun/rakun   # background, transient
systemctl --user stop rakun                     # stop that one (not rakunctl stop)
rakunctl install-service [--web network] [--port N]   # user service: starts at every login
rakunctl uninstall-service                       # stops it and removes the service
```

`install-service` takes the same `--web` and `--port` as `start` and bakes them into the unit. It writes `~/.config/systemd/user/rakun.service` (`Restart=on-failure`, so
`rakunctl stop` really stops it until the next login) and runs `systemctl --user enable
--now`. Limits: the service has no screen (`DISPLAY`), so **Zoom installers, which open a
window, do not work with it**; and with `webAccess` set to `network` the web would be open
to the network, unprotected, at every login (the command warns about both). Do not mix it
with the `systemd-run` line above: both are called `rakun`.

`-s` works with any command that ends (not `events`, nor `--no-wait`). Several `-s`
at once are safe: rakun stops when the **last** one finishes, and only if a `-s`
started it. A rakun you started yourself, or systemd did, is never stopped by `-s`.
Every other command tells you when rakun is stopped. The files `-s` uses to
coordinate live in `~/.local/state/Rakun/serve/`.

Check it with `rakunctl status` (or `scripts/smoke.sh`, or `curl http://127.0.0.1:17370/health`).
If the release has the web, open `http://127.0.0.1:17370` in a browser of this machine.

By default only this machine can open the web. `rakunctl config webAccess network` (or
`rakun --web=network`, or `rakunctl start --web network`) opens it to the whole network **without
any protection**, for experimental or home use only; `off` turns the web off (the API stays on
this machine). `--port <n>` (or `RAKUN_PORT`) changes the port. See _Who can open the web_ in [API.md](API.md).

### Helper binaries

rakun runs other programs for the stores (legendary for Epic, gogdl and Comet for GOG, nile for
Amazon, umu for the Proton prefixes, and Zoom's installer script). The normal tarball does not
carry them: right after installing, run

```bash
rakunctl helpers            # which ones are installed: HELPER, PINNED, INSTALLED, STATE
rakunctl helpers update     # asks rakun to download the missing ones (it starts rakun for the time it takes)
```

`update` downloads the versions rakun was tested with and checks each file against its
`sha256` (a file that does not match is not installed). `--latest` downloads the newest release
of each one instead, **without checking anything**: rakun reads their output, so a new version can
break it; use it at your own risk. The tools go to `~/.local/share/rakun/bin` (they survive a
rakun update) and the Windows `.exe` files straight to `~/.local/share/rakun/mount/bin`, where the
prefixes see them as `C:\Launchers\bin`. With a `-full` tarball nothing needs downloading: rakun
puts what it carries in place when it starts.

rakun **starts even if some are missing** and says so: a warning in the log, a line in
`rakunctl status` (`Helpers: all installed`, or what is missing or not at the tested version,
and what to run) and, in the web, a notice with a **Download** button and a _Helper binaries_
screen in the menu (the list with the state of each one, _Download missing_ and _Download
latest_). Any client can ask rakun to update them (`updateHelpers`, see [API.md](API.md)); with
`webAccess` set to `network` that one is only answered to this machine. A command that needs a
helper that is not there fails saying how to install it.
`unzip` is needed to unpack one of them.

### Requirements

- Linux and Steam
- `curl` (installer and smoke script), `xdg-open`, `unzip` (to download the helper binaries)
- For Windows games: GE-Proton in `~/.local/share/Steam/compatibilitytools.d`
  (rakun picks the first `*proton*` folder it finds; change it with
  `rakunctl config protonPath <folder>`, the folder must contain the `proton` script).
  Zoom Platform's Windows installers also need it.
- For Zoom Platform's **Windows** games, a screen: its installer is a normal Windows
  wizard (licence, options) that opens in a window through Proton, so rakun has to
  run with a `DISPLAY` (desktop mode, or a session that has one). Without it the
  install fails and rakun reports the error. rakun checks this **before** downloading
  anything and refuses at once when `DISPLAY` is empty, its X server is gone, or rakun
  runs in Steam's game mode (a window there would not be visible). It is a best-effort
  check: rakun keeps the environment of whoever started it, so restart it after
  switching between desktop and game mode. Zoom support is **experimental**; Zoom's
  Linux installers do not need a screen.

### Language

rakun has no translations: its messages (including the `showDialog` events) are in
English. The `language` setting (`rakunctl config language es`) only chooses the
language GOG installs by default, and it applies at once.

---

## Development

```bash
pnpm install
pnpm download-helper-binaries    # fills public/bin for the tarballs (honours HTTPS_PROXY; both archs + the Windows files)
pnpm build && pnpm start         # runs build/rakun.cjs from the checkout
pnpm start:ctl start             # or: rakunctl from the checkout starts that same build
pnpm test                        # jest
pnpm package [x64|arm64|all] [--full]   # tarballs in dist/ (default: both archs, no helpers; --full adds the -full ones)
pnpm codecheck && pnpm lint && pnpm prettier && pnpm test
```

`RAKUN_PORT` (or `--port`) changes the API port (default 17370), and `RAKUN_WEB` (or `--web`) who
can open the web; the token lives in `~/.config/rakun/api.json`.

The web is in `web/` (React, built with esbuild; its own `tsconfig.json`, tests in a Jest `jsdom`
project). `pnpm build:web` writes `build/web`, which `rakun.cjs` serves from the checkout; `pnpm
build` includes it and `RAKUN_WEB_DIR` points rakun at another folder. `pnpm test`, `pnpm lint` and
`pnpm codecheck` cover `web/` too.

When testing, **make sure a temporary `HOME` is not empty** (`H=$(mktemp -d); [ -n "$H" ] || exit`):
with `HOME=` empty rakun writes its folders relative to the current directory.

---

## Troubleshooting

| Symptom                                                        | What it means / what to do                                                                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rakunctl` says "rakun parado"                                 | rakun is not running: `rakunctl start`.                                                                                                                                                     |
| `rakun did not start (code 1)`                                 | Read the log it points to (`~/.local/state/Rakun/logs/rakun.log`); the reason is the last `failed to start` line. A busy port is `EADDRINUSE`: use `--port`.                                |
| `403` with `Host "…" is not allowed`                           | In `network` mode open the web by the IP or the name of the machine, not by another name (a router alias is not in the list).                                                               |
| `403` with `can only be called from the machine rakun runs on` | In `network` mode settings, folders, logs and a few more channels only answer to this machine: open `http://127.0.0.1:<port>` there. Opening it by the machine's own LAN IP does not count. |
| `No GE-Proton configured` in the log (older versions)          | A GE-Proton installed later was never looked for. Update rakun, or set it: `rakunctl config protonPath <folder>`.                                                                           |
| A Windows game does nothing in Steam                           | Force GE-Proton in the game's Steam properties (rakun does not set the compatibility tool) and check the prefix in `compatdata/<id>`.                                                       |
| Zoom's Windows install fails at once                           | It needs a screen (`DISPLAY`): desktop mode, not game mode.                                                                                                                                 |
| The web shows the old design after an update                   | The installed copy is `~/.local/opt/rakun/web`: reinstall (`scripts/install.sh`) or copy `build/web/.` there, then Ctrl+F5.                                                                 |

---

## File locations

```
~/.config/rakun/
├── api.json                 — API port and token (mode 0600)
├── config.json              — Settings
├── steam_shortcuts.json     — Games added to Steam
├── store/                   — Timestamps, download queue
├── icons/, tools/           — Game icons, helper tools
├── legendaryConfig/         — Epic login + installed.json
├── gogdlConfig/, gog_store/ — GOG login + installed.json
├── nile_config/, nile_store/— Amazon login + installed.json
└── zoom_store/              — Zoom Platform login

~/.cache/rakun/             — Regenerable caches ($XDG_CACHE_HOME)
~/.local/opt/rakun/         — The installed app (rakun, rakunctl, node, public/, web/)
~/.local/state/Rakun/       — ($XDG_STATE_HOME)
├── logs/                    — rakun.log, runners/<store>.log, games/<app>_<store>/
└── serve/                   — files `rakunctl -s` uses to know who is running

~/.local/share/rakun/
├── games/                   — Symlinks to installed game dirs
├── bin/                     — The helper binaries (rakunctl helpers update)
├── runner/                  — one small .bat per game for Steam (Windows games)
└── mount/                   — Mount structure for Proton prefixes
    └── scripts/             — Launcher_games.bat (the runner) and eos-overlay.bat

~/Games/Rakun/              — Default game install path
```

---

## Credits

- [Relic](https://github.com/FranjeGueje/Relic) and
  [Heroic Games Launcher](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher)
- Everyone listed in [AUTHORS](AUTHORS)
- [Lilita One](https://github.com/google/fonts/tree/main/ofl/lilitaone) by Juan
  Montoreano (SIL Open Font License 1.1, `web/LilitaOne-OFL.txt`): the "Rakun"
  lettering of the web is drawn from its outlines
- [Legendary](https://github.com/derrod/legendary)
- [GOGdl](https://github.com/Heroic-Games-Launcher/heroic-gogdl)
- [Nile](https://github.com/imLinguin/nile)
- [Comet](https://github.com/imLinguin/comet)
- [umu-launcher](https://github.com/Open-Wine-Components/umu-launcher)

---

## License

GPL-3.0-only
