# rakun

<img src="web/icon.png" alt="rakun" width="96" align="right">

[Español](README.es.md)

**rakun installs your PC games on Linux and puts them in Steam.** Log in to Epic Games, GOG, Amazon Games or Zoom Platform, pick a game, and when the download ends it shows up in your Steam library, ready to play. It was made with the Steam Deck in mind, but it runs on any Linux with Steam.

rakun is **not a launcher**. It never runs your games: Steam does. rakun's job is everything before that: signing in, downloading, updating, repairing, uninstalling and wiring the game into Steam.

## What it does

- Signs in to **Epic, GOG, Amazon and Zoom** (you paste the code your browser ends on; no embedded browser)
- Shows your **library** and a **download queue** you can pause, resume and cancel
- **Installs, updates, repairs and uninstalls** games, picks Windows or Linux builds, and can adopt a game that is already on your disk
- Adds each game to **Steam** (shortcut, Proton prefix, cover art) when the install finishes
- Comes with a **web page** (library, downloads, accounts) and a **command line**, `rakunctl`

## How it works

rakun is a small background service with no window. You talk to it from a browser or from the terminal.

```
 browser (web) ─┐
 rakunctl ──────┼──► rakun ──► store tools (legendary, gogdl, nile…) ──► your games
 other clients ─┘      │
                       └──────► Steam (shortcut, prefix, covers)
```

Everything goes through a local HTTP API on `127.0.0.1:17370`, protected by a token. See [API.md](API.md).

## What it is built on

rakun is a fork of [Relic](https://github.com/FranjeGueje/Relic), which is a Linux-only fork of [Heroic Games Launcher](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher) (Heroic → Relic → rakun). Heroic's Electron window is gone; what is left is the part that talks to the stores. The actual downloading is done by open source tools that rakun runs for you: [Legendary](https://github.com/derrod/legendary) (Epic), [GOGdl](https://github.com/Heroic-Games-Launcher/heroic-gogdl) and [Comet](https://github.com/imLinguin/comet) (GOG), [Nile](https://github.com/imLinguin/nile) (Amazon) and [umu-launcher](https://github.com/Open-Wine-Components/umu-launcher) (Proton prefixes).

**Technology:** Node.js 24 and TypeScript, bundled with esbuild; a React web page; Jest for tests; pnpm. No Electron, no Chromium, almost no runtime dependencies.

## Install

Quick install of the latest release (x64, bash):

```bash
V=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/FranjeGueje/rakun/releases/latest); V=${V##*/}; curl -fsSL https://raw.githubusercontent.com/FranjeGueje/rakun/$V/scripts/install.sh | bash -s -- https://github.com/FranjeGueje/rakun/releases/download/$V/rakun-${V#v}-linux-x64.tar.gz
```

Or build it yourself (see [Build](#build)) and install it:

```bash
pnpm package          # makes dist/rakun-<version>-linux-<arch>.tar.gz
scripts/install.sh    # installs it in ~/.local/opt/rakun and links rakun and rakunctl
```

The package carries its own Node, so nothing else is needed on SteamOS.

## First steps

```bash
rakunctl start                # start rakun in the background
rakunctl helpers update       # download the store tools (once)
rakunctl login gog            # or epic, amazon, zoom
rakunctl library gog          # see your games
rakunctl install gog <name>   # install one: it appears in Steam
```

Prefer the mouse? Open **http://127.0.0.1:17370** in a browser on the same machine.

For Windows games, install [GE-Proton](https://github.com/GloriousEggroll/proton-ge-custom) and, once per game, choose it in the game's Steam properties → Compatibility. Zoom's Windows installers need a desktop session.

## Build

You need Node.js 24+, [pnpm](https://pnpm.io), git, `curl` and `unzip`.

```bash
git clone https://github.com/FranjeGueje/rakun.git && cd rakun
pnpm install
pnpm build            # build/rakun.cjs, build/rakunctl.cjs and build/web/
pnpm start            # run it straight from the checkout
pnpm test             # run the tests
pnpm package          # tarballs in dist/ (--full also bundles the store tools)
```

More in [Development](docs/Development.md).

## Good to know

- By default only your own machine can open the web. `--web network` opens it to your whole network **without any protection**: use it at home only, never exposed to the Internet.
- rakun keeps its own files in `~/.config/rakun`, `~/.local/share/rakun` and `~/Games/Rakun`, and shares nothing with Relic. See [File locations](docs/File-Locations.md).
- rakun has no translations; messages are in English.

## Documentation

The [wiki](docs/Home.md) has the rest (in English):

- [Getting started](docs/Getting-Started.md) · [User guide](docs/User-Guide.md) · [Commands](docs/Commands.md)
- [Configuration](docs/Configuration.md) · [Helper binaries](docs/Helper-Binaries.md) · [Troubleshooting](docs/Troubleshooting.md)
- [Steam integration](docs/Steam-Integration.md) · [Architecture](docs/Architecture.md) · [API](API.md)
- [Changelog](CHANGELOG.md)

## Credits

Thanks to everyone listed in [AUTHORS](AUTHORS), to the Relic and Heroic projects, and to the authors of the tools above. The "Rakun" lettering of the web is drawn from [Lilita One](https://github.com/google/fonts/tree/main/ofl/lilitaone) by Juan Montoreano (SIL Open Font License 1.1, `web/LilitaOne-OFL.txt`).

## License

[GPL-3.0-only](COPYING)
