# Steam integration

How a finished install becomes a game in Steam. rakun never launches games: Steam does.

rakun never launches games. Every game is added to Steam as a non-Steam shortcut, and the user launches everything from Steam.

## Installation flow

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

## Runner files

For Windows games, rakun creates a small `.bat` file per game. This is the file that Steam launches. It only says which store and game it is, and calls the one runner all the games share:

```
@echo off
rem FranjeGueje runner: the logic is in C:\Launchers\scripts\Launcher_games.bat
set "STORE=legendary"
set "IDGAME=<appName>"
call "C:\Launchers\scripts\Launcher_games.bat" %*
exit /b %errorlevel%
```

A GOG game also sets `GAMEFOLDER` (its folder in `c:\games`) and `GOGUSER` (the user Comet logs in with). The runner, `Launcher_games.bat` (**FranjeGueje runner**, with its version on the first line it prints), sets the environment, jumps to the block of the store (`legendary`, `gog` or `nile`), checks its tools and launches the game through the store's CLI. rakun writes it into `mount/scripts/` at every start, so a new version reaches every game without regenerating their `.bat` files. The EOS Overlay script lives next to it.

For Linux native GOG games, there is no `.bat`. rakun uses the `start.sh` script that GOG ships with the game. Steam runs the shell script natively.

## Symlink structure

rakun maintains a directory of symbolic links at `~/.local/share/rakun/games/` that map game folder names to their actual install locations:

```
~/.local/share/rakun/games/
├── Cyberpunk2077 → /home/user/Games/Rakun/Cyberpunk2077
├── Beat Cop     → /home/user/Games/Rakun/gog/Beat Cop
└── Fortnite     → /media/games/Fortnite
```

## Windowify (path transformation)

Windows store backends need to see paths as `c:\games\<name>` when running inside a Proton prefix. rakun creates a mount structure at `~/.local/share/rakun/mount/` that mirrors a Windows filesystem. Each store's config is symlinked into the mount, and `installed.json` is rewritten with `c:\` paths.

## Prefix preparation

For Windows games, rakun creates a Wine prefix inside `compatdata/<steamAppId>/drive_c/`. Two symlinks inside `drive_c` connect the mount and game structures:

```
drive_c/Launchers/  → ~/.local/share/rakun/mount/
drive_c/games/  → ~/.local/share/rakun/games/
```

If a GE-Proton is available, rakun runs `umu-run exit` to initialize the prefix. The `protonPath` setting empty means **automatic**: the first `*proton*` folder of `~/.local/share/Steam/compatibilitytools.d` that exists _when it is needed_ (so a GE-Proton installed after rakun was first run is found too). Without any, the prefix is left as plain folders and Steam's Proton creates it on the first launch.

> [!IMPORTANT]
> **Steam compatibility tool:** rakun does **not** set it. For a Windows game, open its properties in Steam → Compatibility → force GE-Proton, or Steam will try to run the `.bat` runner as a Linux program.

## Steam shortcut registration

rakun uses the `steam://addnonsteamgame/` protocol to add games to Steam. It never writes directly to `shortcuts.vdf`. The process:

1. Writes a temporary `.desktop` in `/tmp` (`Name` = game title, `Exec` = runner path) so the shortcut gets the game's name instead of the runner's filename, then opens `steam://addnonsteamgame/<desktop-path>` via xdg-open
2. Steam opens an "Add Non-Steam Game" dialog
3. rakun polls `shortcuts.vdf` every 1.5s for up to 15s
4. Once the game appears, it reads the assigned `steamAppId`
5. The temporary `.desktop` is deleted afterwards (Steam only keeps `Name` and `Exec`)
6. If Steam is not running or the dialog is not confirmed, the operation times out

## Grid artwork

After adding the game, rakun downloads artwork from SteamGridDB for all Steam users:

- Header/banner (460x215)
- Portrait (600x900)
- Hero banner
- Logo/wordmark
- Icon

A SteamGridDB API key is required in settings.

## Repair flow

If the repair completes without error, rakun repeats the whole Steam integration of an install, even if the game was already added: it makes the `.bat` for the game in `~/.local/share/rakun/runner/` again, adds the shortcut to Steam **only if it is missing** (a deleted one comes back), sets the prefix up again and asks for the covers again. The properties window of Steam opens only when the shortcut was really added. A failure in the Steam part is logged and does not make the repair fail.

## Uninstall cleanup

When a game is uninstalled, rakun:

1. Deletes the `.bat` runner file (Windows games only)
2. Removes the symlink from `~/.local/share/rakun/games/`
3. Removes the Zoom prefix symlink (Zoom games only)
4. Deletes all 5 grid artwork files
5. Removes the shortcut from `steam_shortcuts.json`

The Steam shortcut itself in `shortcuts.vdf` is **not** removed by rakun.

---

See also: [Helper binaries](Helper-Binaries.md) · [File locations](File-Locations.md) · [Troubleshooting](Troubleshooting.md)
