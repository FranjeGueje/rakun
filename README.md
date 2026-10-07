# relicd

relicd is a headless fork of [Relic](https://github.com/FranjeGueje/Relic) (itself a
Linux-only fork of [Heroic Games Launcher](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher)).
It is **backend only**: a Node service, no Electron and no window of its own. A local
HTTP API lets a client (the plan is a module for [Invasor](../proyecto-invasor/)) log in
to the stores, list the library and install, update, repair and uninstall games.

relicd is **not** a launcher. When an install finishes it runs the Steam integration
(shortcut, prefix, grids) and the game shows up in Steam. Steam is the launcher.

> The project is an experiment. It has its own identity and shares nothing with Relic:
> `~/.config/relicd`, `~/.cache/relicd`, `~/.local/state/Relicd`, `~/.local/share/relicd`
> and `~/Games/Relicd`. Inside each game's Proton prefix the mount is still called
> `C:\relic` (the `.bat` runners use that name; there is no way to collide there).

## Español

relicd es un fork **solo backend** de Relic: un servicio Node sin Electron ni ventana. Una
API HTTP local permite a un cliente (el plan es un módulo de Invasor) iniciar sesión en las
tiendas, ver la biblioteca e instalar, actualizar, reparar y desinstalar juegos. No lanza
juegos: al terminar cada instalación hace la integración con Steam y el juego aparece en
Steam. No comparte nada con Relic (rutas `relicd`, no `relic`). `relicctl` es el
cliente de línea de comandos (ver la sección _relicctl_; la guía de pruebas está en
[GUIA.md](GUIA.md)).

---

## Features

- Login: Epic Games, GOG, Amazon Games, Zoom Platform (paste the code or address your
  browser ends on; no embedded browser)
- Library, download queue (pause, resume, cancel), install, update, repair and uninstall
- `relicctl`, a command line client for all of it, and a way to start relicd only
  while a command runs (`relicctl -s`)
- Global settings (install path, GE-Proton, workers, language…) with validation
- Automatic Steam integration (shortcuts, grids, prefixes)
- GOG achievements (experimental, via [Comet](https://github.com/imLinguin/comet))
- Linux native game support (GOG)

The API (connection, channels, login flow and events) is documented in [API.md](API.md); a step-by-step test walkthrough (in Spanish) is in [GUIA.md](GUIA.md).

---

## relicctl

`relicctl` talks to a running relicd over HTTP (it reads `~/.config/relicd/api.json`;
`RELICD_API_FILE` points it at another one). Stores are `epic`, `gog`, `amazon` and
`zoom`; `--json` prints for scripts.

| Command                                       | What it does                                                       |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `start` / `stop [--force]`                    | start relicd in the background / stop it                           |
| `status`                                      | version, sessions, queue (or "relicd parado")                      |
| `login <store>`, `logout <store>`             | log in (paste what the browser ends on) / out                      |
| `import-relic`                                | copy the sessions of Relic (`~/.config/relic`)                     |
| `library [store] [--installed]`, `refresh`    | list the library / refresh it and wait                             |
| `install <store> <app> [--path] [--lang]`     | install (every DLC unless `--skip-dlcs`); waits unless `--no-wait` |
| `update`, `repair`, `uninstall <store> <app>` | the same, one game                                                 |
| `queue [clear]`, `pause`, `resume`, `cancel`  | download queue (`cancel --remove-files` deletes what was fetched)  |
| `config [key [value]]`                        | list, read or change the global settings                           |
| `logs [store [app]] [--type T]`               | relicd's log, a store's or one game's                              |
| `cache clear [store]`, `reset [--yes]`        | empty library caches / forget sessions and settings (stops relicd) |
| `events`, `call <channel> [json]`             | follow the events / call any exposed channel                       |

`-s` runs one command with relicd up even if it was stopped, and stops it afterwards
(see Installation). The channels behind each command are in [API.md](API.md).

---

## How Steam Integration Works

relicd never launches games. Every game is added to Steam as a non-Steam shortcut,
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
  │    ~/.local/share/relicd/games/<name>          • Create .bat runner file
  │    → actual install path                        ~/.local/share/relicd/runner/<Game>.bat
  │                                                  │
  │  • Use existing start.sh                        ▼
  │    as the Steam shortcut target               • Add to Steam via temp .desktop
  │                                                  + steam://addnonsteamgame
  │  • Skip: .bat, windowify, prefix                │
  │                                                  ▼
  │                                              • Windowify path transform
  │                                                Linux paths → c:\games\<name>
  │                                                Creates mount structure at:
  │                                                  ~/.local/share/relicd/mount/
  │                                                  │
  │                                                  ▼
  │                                              • Create symlink
  │                                                ~/.local/share/relicd/games/<name>
  │                                                → actual install path
  │                                                  │
  │                                                  ▼
  │                                              • Create Proton prefix
  │                                                Steam compatdata/<id>/drive_c/
  │                                                Runs umu-run to init prefix
  │                                                  │
  │                                                  ▼
  │                                              • Epic games only:
  │                                                run c:\relic\eos-overlay.bat
  │                                                through umu-run to install
  │                                                and enable the EOS Overlay
  │                                                in that prefix
  │                                                  │
  │                                                ▼ (both flows converge)
  │
  └──────────────────────┬──────────────────────┘
                         │
                         ▼
                  Save shortcut to
                  ~/.config/relicd/steam_shortcuts.json
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

For Windows games, relicd creates a `.bat` file. This is the file that Steam launches.
It sets environment variables and launches the game through the store's CLI:

```
@echo off
@SET LEGENDARY_CONFIG_PATH=c:\relic\Legendary
@SET GOGDL_CONFIG_PATH=c:\relic\
@SET PATH=%PATH%;c:\relic\bin
@legendary launch <appName> %*
```

For Linux native GOG games, there is no `.bat`. relicd uses the `start.sh` script
that GOG ships with the game. Steam runs the shell script natively.

### Symlink structure

relicd maintains a directory of symbolic links at `~/.local/share/relicd/games/`
that map game folder names to their actual install locations:

```
~/.local/share/relicd/games/
├── Cyberpunk2077 → /home/user/Games/Relicd/Cyberpunk2077
├── Beat Cop     → /home/user/Games/Relicd/gog/Beat Cop
└── Fortnite     → /media/games/Fortnite
```

### Windowify (path transformation)

Windows store backends need to see paths as `c:\games\<name>` when running inside
a Proton prefix. relicd creates a mount structure at `~/.local/share/relicd/mount/`
that mirrors a Windows filesystem. Each store's config is symlinked into the mount,
and `installed.json` is rewritten with `c:\` paths.

### Prefix preparation

For Windows games, relicd creates a Wine prefix inside `compatdata/<steamAppId>/drive_c/`.
Two symlinks inside `drive_c` connect the mount and game structures:

```
drive_c/relic/  → ~/.local/share/relicd/mount/
drive_c/games/  → ~/.local/share/relicd/games/
```

If GE-Proton is configured, relicd runs `umu-run exit` to initialize the prefix.

### Steam shortcut registration

relicd uses the `steam://addnonsteamgame/` protocol to add games to Steam. It never
writes directly to `shortcuts.vdf`. The process:

1. Writes a temporary `.desktop` in `/tmp` (`Name` = game title, `Exec` = runner
   path) so the shortcut gets the game's name instead of the runner's filename,
   then opens `steam://addnonsteamgame/<desktop-path>` via xdg-open
2. Steam opens an "Add Non-Steam Game" dialog
3. relicd polls `shortcuts.vdf` every 1.5s for up to 15s
4. Once the game appears, it reads the assigned `steamAppId`
5. The temporary `.desktop` is deleted afterwards (Steam only keeps `Name` and `Exec`)
6. If Steam is not running or the dialog is not confirmed, the operation times out

### Grid artwork

After adding the game, relicd downloads artwork from SteamGridDB for all Steam users:

- Header/banner (460x215)
- Portrait (600x900)
- Hero banner
- Logo/wordmark
- Icon

A SteamGridDB API key is required in settings.

### Repair flow

Repairing a game never touches Steam or the prefix. If the repair completes without
error, relicd only regenerates the `.bat` runner file in `~/.local/share/relicd/runner/`
(via `createRelicBat()`), using the data already stored in `steam_shortcuts.json`.
Zoom Platform games and games that aren't tracked in Steam are skipped.

### Uninstall cleanup

When a game is uninstalled, relicd:

1. Deletes the `.bat` runner file (Windows games only)
2. Removes the symlink from `~/.local/share/relicd/games/`
3. Removes the Zoom prefix symlink (Zoom games only)
4. Deletes all 5 grid artwork files
5. Removes the shortcut from `steam_shortcuts.json`

The Steam shortcut itself in `shortcuts.vdf` is **not** removed by relicd.

---

---

## Installation

relicd has no public release yet. Build the tarball and install it:

```bash
git clone <this repository> relicd && cd relicd
pnpm install
pnpm download-helper-binaries
pnpm package                     # dist/relicd-<version>-linux-x64.tar.gz and -arm64.tar.gz
scripts/install.sh                # picks the tarball of this machine from dist/
```

`pnpm package x64` (or `arm64`) builds just one. Each tarball carries only its own helper
binaries and its own Node, so nothing else is needed on SteamOS. The installer
puts it in `~/.local/opt/relicd` and links `~/.local/bin/relicd`. It creates **no
service**; start it when you want it:

```bash
relicctl start                                   # background, detached
relicctl stop                                    # stops it (--force if a download is running)
relicctl -s library                              # starts relicd only if stopped, runs the
                                                 # command, then stops it again
relicd                                           # foreground, Ctrl+C stops it
systemd-run --user --unit=relicd ~/.local/opt/relicd/relicd   # background, transient
systemctl --user stop relicd                     # stop that one (not relicctl stop)
```

`-s` works with any command that ends (not `events`, nor `--no-wait`). Several `-s`
at once are safe: relicd stops when the **last** one finishes, and only if a `-s`
started it. A relicd you started yourself, or systemd did, is never stopped by `-s`.
Every other command tells you when relicd is stopped. The files `-s` uses to
coordinate live in `~/.local/state/Relicd/serve/`.

Check it with `relicctl status` (or `scripts/smoke.sh`, or `curl http://127.0.0.1:17370/health`).

### Requirements

- Linux and Steam
- `curl` (installer and smoke script), `xdg-open`
- For Windows games: GE-Proton in `~/.local/share/Steam/compatibilitytools.d`
  (relicd picks the first `*proton*` folder it finds; change it with
  `relicctl config protonPath <folder>`, the folder must contain the `proton` script).
  Zoom Platform's Windows installers also need it.
- For Zoom Platform's **Windows** games, a screen: its installer is a normal Windows
  wizard (licence, options) that opens in a window through Proton, so relicd has to
  run with a `DISPLAY` (desktop mode, or a session that has one). Without it the
  install fails and relicd reports the error. relicd checks this **before** downloading
  anything and refuses at once when `DISPLAY` is empty, its X server is gone, or relicd
  runs in Steam's game mode (a window there would not be visible). It is a best-effort
  check: relicd keeps the environment of whoever started it, so restart it after
  switching between desktop and game mode. Zoom support is **experimental**; Zoom's
  Linux installers do not need a screen.

### Language

relicd has no translations: its messages (including the `showDialog` events) are in
English. The `language` setting (`relicctl config language es`) only chooses the
language GOG installs by default, and it applies at once.

---

## Development

```bash
pnpm install
pnpm download-helper-binaries    # honours HTTPS_PROXY; x64 and arm64 Linux helpers + x64 Windows ones
pnpm build && pnpm start         # runs build/relicd.cjs from the checkout
node build/relicctl.cjs start    # or: relicctl from the checkout starts that same build
pnpm test                        # jest
pnpm package [x64|arm64|all]     # tarballs in dist/ (default: both)
./review.sh                      # clean build: tsc, lint, prettier, tests, package
```

`RELICD_PORT` changes the API port (default 17370). The token lives in
`~/.config/relicd/api.json`.

---

## File locations

```
~/.config/relicd/
├── api.json                 — API port and token (mode 0600)
├── config.json              — Settings
├── steam_shortcuts.json     — Games added to Steam
├── store/                   — Timestamps, download queue
├── icons/, tools/           — Game icons, helper tools
├── legendaryConfig/         — Epic login + installed.json
├── gogdlConfig/, gog_store/ — GOG login + installed.json
├── nile_config/, nile_store/— Amazon login + installed.json
└── zoom_store/              — Zoom Platform login

~/.cache/relicd/             — Regenerable caches ($XDG_CACHE_HOME)
~/.local/state/Relicd/       — ($XDG_STATE_HOME)
├── logs/                    — relicd.log, runners/<store>.log, games/<app>_<store>/
└── serve/                   — files `relicctl -s` uses to know who is running

~/.local/share/relicd/
├── games/                   — Symlinks to installed game dirs
├── runner/                  — .bat files for Steam (Windows games)
└── mount/                   — Mount structure for Proton prefixes

~/Games/Relicd/              — Default game install path
```

---

## Credits

- [Relic](https://github.com/FranjeGueje/Relic) and
  [Heroic Games Launcher](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher)
- [Legendary](https://github.com/derrod/legendary)
- [GOGdl](https://github.com/Heroic-Games-Launcher/heroic-gogdl)
- [Nile](https://github.com/imLinguin/nile)
- [Comet](https://github.com/imLinguin/comet)
- [umu-launcher](https://github.com/Open-Wine-Components/umu-launcher)

---

## License

GPL-3.0-only
