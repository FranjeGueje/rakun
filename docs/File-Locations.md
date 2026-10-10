# File locations

```
~/.config/rakun/
├── api.json                 — API port and token (mode 0600)
├── config.json              — Settings
├── steam_shortcuts.json     — Games added to Steam
├── download-manager.json    — Download queue
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
    ├── scripts/             — Launcher_games.bat (the runner), Launcher_games.ini (its options) and eos-overlay.bat
    └── logs/                — <game name>.log of the runner, if LOG_TO_FILE=1 in the ini

~/Games/Rakun/              — Default game install path
```
