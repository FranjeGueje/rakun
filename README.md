# rakun

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
> `C:\Launchers` (`drive_c/Launchers`; the `.bat` runners use that name via `%LAUNCHERS%`).

## Español

rakun es un fork **solo backend** de Relic (que viene de Heroic Games Launcher: Heroic → Relic → rakun; el historial de git de los tres se conserva y las personas que contribuyeron están en [AUTHORS](AUTHORS)): un servicio Node sin Electron ni ventana. Una
API HTTP local permite a un cliente (la web de rakun, `rakunctl` o el módulo `invasor-relic` de Invasor) iniciar sesión en las
tiendas, ver la biblioteca e instalar, actualizar, reparar y desinstalar juegos. No lanza
juegos: al terminar cada instalación hace la integración con Steam y el juego aparece en
Steam. `relicd-client`, la app de Electron que fue el primer cliente, está **archivada y sin mantenimiento**: la
reemplaza la web de rakun. No comparte nada con Relic (rutas `rakun`, no `relic`). `rakunctl` es el
cliente de línea de comandos (ver la sección _rakunctl_; la guía de pruebas está en
[GUIA.md](GUIA.md)).

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

The API (connection, channels, login flow and events) is documented in [API.md](API.md); a step-by-step test walkthrough (in Spanish) is in [GUIA.md](GUIA.md).

---

## rakunctl

`rakunctl` talks to a running rakun over HTTP (it reads `~/.config/rakun/api.json`;
`RAKUN_API_FILE` points it at another one). Stores are `epic`, `gog`, `amazon` and
`zoom`; `--json` prints for scripts.

| Command                                        | What it does                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| `start` / `stop [--force]`                     | start rakun in the background / stop it                              |
| `start [--web local\|network\|off] [--port N]` | who can open the web (default: the `webAccess` setting) and the port |
| `status`                                       | version, sessions, queue (or "rakun parado")                         |
| `login <store>`, `logout <store>`              | log in (paste what the browser ends on) / out                        |
| `import-relic`                                 | copy the sessions of Relic (`~/.config/relic`)                       |
| `library [store] [--installed]`, `refresh`     | list the library / refresh it and wait                               |
| `install <store> <app> [--path] [--lang]`      | install (every DLC unless `--skip-dlcs`); waits unless `--no-wait`   |
| `update`, `repair`, `uninstall <store> <app>`  | the same, one game                                                   |
| `queue [clear]`, `pause`, `resume`, `cancel`   | download queue (`cancel --remove-files` deletes what was fetched)    |
| `config [key [value]]`                         | list, read or change the global settings                             |
| `logs [store [app]] [--type T]`                | rakun's log, a store's or one game's                                 |
| `cache clear [store]`, `reset [--yes]`         | empty library caches / forget sessions and settings (stops rakun)    |
| `events`, `call <channel> [json]`              | follow the events / call any exposed channel                         |

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
  │                                                run c:\Launchers\eos-overlay.bat
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

For Windows games, rakun creates a `.bat` file. This is the file that Steam launches.
It sets environment variables and launches the game through the store's CLI:

```
@echo off
@SET LEGENDARY_CONFIG_PATH=c:\Launchers\Legendary
@SET GOGDL_CONFIG_PATH=c:\Launchers\
@SET PATH=%PATH%;c:\Launchers\bin
@legendary launch <appName> %*
```

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

Repairing a game never touches Steam or the prefix. If the repair completes without
error, rakun only regenerates the `.bat` runner file in `~/.local/share/rakun/runner/`
(via `createRakunBat()`), using the data already stored in `steam_shortcuts.json`.
Zoom Platform games and games that aren't tracked in Steam are skipped.

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
pnpm download-helper-binaries
pnpm package                     # dist/rakun-<version>-linux-x64.tar.gz and -arm64.tar.gz
scripts/install.sh                # picks the tarball of this machine from dist/
```

`pnpm package x64` (or `arm64`) builds just one. Each tarball carries only its own helper
binaries (legendary, gogdl and nile for Linux; the Windows `.exe` ones, `comet.exe` among
them, run inside the prefix) and its own Node, so nothing else is needed on SteamOS. The installer
puts it in `~/.local/opt/rakun` and links `~/.local/bin/rakun`. It creates **no
service**; start it when you want it:

```bash
rakunctl start                                   # background, detached
rakunctl stop                                    # stops it (--force if a download is running)
rakunctl -s library                              # starts rakun only if stopped, runs the
                                                 # command, then stops it again
rakun                                           # foreground, Ctrl+C stops it
systemd-run --user --unit=rakun ~/.local/opt/rakun/rakun   # background, transient
systemctl --user stop rakun                     # stop that one (not rakunctl stop)
```

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

### Requirements

- Linux and Steam
- `curl` (installer and smoke script), `xdg-open`
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
pnpm download-helper-binaries    # honours HTTPS_PROXY; x64 and arm64 Linux helpers + x64 Windows ones
pnpm build && pnpm start         # runs build/rakun.cjs from the checkout
node build/rakunctl.cjs start    # or: rakunctl from the checkout starts that same build
pnpm test                        # jest
pnpm package [x64|arm64|all]     # tarballs in dist/ (default: both)
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
| `rakun no ha arrancado (código 1)`                             | Read the log it points to (`~/.local/state/Rakun/logs/rakun.log`); the reason is the last `failed to start` line. A busy port is `EADDRINUSE`: use `--port`.                                |
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
├── runner/                  — .bat files for Steam (Windows games)
└── mount/                   — Mount structure for Proton prefixes

~/Games/Rakun/              — Default game install path
```

---

## Credits

- [Relic](https://github.com/FranjeGueje/Relic) and
  [Heroic Games Launcher](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher)
- Everyone listed in [AUTHORS](AUTHORS)
- [Legendary](https://github.com/derrod/legendary)
- [GOGdl](https://github.com/Heroic-Games-Launcher/heroic-gogdl)
- [Nile](https://github.com/imLinguin/nile)
- [Comet](https://github.com/imLinguin/comet)
- [umu-launcher](https://github.com/Open-Wine-Components/umu-launcher)

---

## License

GPL-3.0-only
