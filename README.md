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
Steam. No comparte nada con Relic (rutas `relicd`, no `relic`).

---

## Features

- Login: Epic Games, GOG, Amazon Games, Zoom Platform (paste the code or address your
  browser ends on; no embedded browser)
- Library, download queue, install, update, repair and uninstall
- Automatic Steam integration (shortcuts, grids, prefixes)
- GOG achievements (experimental, via [Comet](https://github.com/imLinguin/comet))
- Linux native game support (GOG)

The API (connection, channels, login flow and events) is documented in [API.md](API.md); a step-by-step test walkthrough (in Spanish) is in [GUIA.md](GUIA.md).

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
                  ~/.config/relic/steam_shortcuts.json
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
pnpm package                     # dist/relicd-<version>-linux-x64.tar.gz
scripts/install.sh dist/relicd-*-linux-x64.tar.gz
```

The tarball carries its own Node, so nothing else is needed on SteamOS. The installer
puts it in `~/.local/opt/relicd` and links `~/.local/bin/relicd`. It creates **no
service**; start it when you want it:

```bash
relicd                                           # foreground, Ctrl+C stops it
systemd-run --user --unit=relicd ~/.local/opt/relicd/relicd   # background, transient
systemctl --user stop relicd                     # stop the background one
```

Check it with `relicctl status` (or `scripts/smoke.sh`, or `curl http://127.0.0.1:17370/health`).

### Requirements

- Linux and Steam
- `curl` (installer and smoke script), `xdg-open`

---

## Development

```bash
pnpm install
pnpm download-helper-binaries
pnpm build && pnpm start         # runs build/relicd.cjs from the checkout
pnpm test                        # jest
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
├── store/                   — Timestamps, download queue
├── legendaryConfig/         — Epic login + installed.json
├── gogdlConfig/             — GOG login + installed.json
├── nile_config/             — Amazon login + installed.json
├── zoom_store/              — Zoom Platform login
└── GamesConfig/             — Per-game settings

~/.cache/relicd/             — Regenerable caches ($XDG_CACHE_HOME)
~/.local/state/Relicd/logs/  — Logs ($XDG_STATE_HOME)

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
