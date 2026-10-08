# User guide

Everyday tasks. Every example has a button in the web as well; the command is the same thing from the terminal. Stores are `epic`, `gog`, `amazon` and `zoom`.

## Library

```bash
rakunctl library                 # every store
rakunctl library gog --installed # only what is installed
rakunctl refresh gog             # ask the store again and wait
```

After a login, that store refreshes by itself. A library is cached; `rakunctl cache clear [store]` empties the cache.

## Install

```bash
rakunctl install gog <appName>
rakunctl install gog <appName> --path /media/games --lang es-ES
rakunctl install epic <appName> --skip-dlcs
```

- DLCs are installed unless you pass `--skip-dlcs`.
- `--lang` picks the install language (on GOG, `en-US` if not given).
- A game with both builds gets the Linux one unless you say `--platform windows`.
- Default path: `~/Games/Rakun` (setting `defaultInstallPath`).
- Installing a game that is already installed is refused: use `update` or `repair`.
- `--no-wait` returns at once and the command no longer reports the result.

### A specific GOG version

```bash
rakunctl versions gog <appName>                 # builds and branches, the current one marked
rakunctl install gog <appName> --build ID       # or --branch NAME
rakunctl update gog <appName> --build ID        # move an installed game
```

A pinned version is not moved by a plain `rakunctl update`. Epic, Amazon and Zoom always use the latest.

### A game that is already on the disk

```bash
rakunctl import gog <appName> /path/to/folder [--platform windows|linux]
```

Registers it without downloading it and adds it to Steam. Not available for Zoom.

## Update, repair, uninstall

```bash
rakunctl update                  # every game with a new version
rakunctl update gog              # one store
rakunctl update gog <appName>    # one game (Zoom is not updated)
rakunctl repair gog <appName>    # verify and fix files, then redo the Steam integration
rakunctl uninstall gog <appName> # deletes the game's files
```

An uninstall does not remove the Steam shortcut: delete it by hand from the Steam library.

## Downloads queue

```bash
rakunctl queue                   # what is running and waiting
rakunctl pause                   # pause the current download
rakunctl resume
rakunctl cancel [--remove-files] # --remove-files deletes what was fetched
rakunctl queue clear             # empty the finished list
```

## Steam covers

Covers (header, portrait, hero, logo, icon) come from SteamGridDB and need your own key: paste it in the web settings, or call `rakunctl call steamgriddb.setApiKey '["YOUR_KEY"]'`. Without a key rakun adds the game to Steam without images. A game installed before setting the key needs a `repair` to get them.

## The web

`http://127.0.0.1:17370` (library, game sheet, downloads, accounts, menu, helper binaries). It works with mouse, keyboard and gamepad. Who may open it is the `webAccess` setting, see [Configuration](Configuration.md#web-access).

## Logs and state

```bash
rakunctl logs                    # rakun's own log
rakunctl logs gog                # a store's log
rakunctl logs gog <appName> --type install
rakunctl events                  # follow what rakun is doing live
```

---

Next: [Commands](Commands.md) · [Troubleshooting](Troubleshooting.md)
