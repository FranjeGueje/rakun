# Manual test guide

Everything is tested with `rakunctl`, `curl` and `scripts/smoke.sh`. The sections use `smoke.sh` because it shows the exact channel and arguments; `rakunctl` does the same with commands (see the table below). Run from the root of the repository. The script reads the port and the token from `~/.config/rakun/api.json`. The full contract is in [API.md](../API.md).

## Start and stop

rakun installs no service: you start it when you need it.

```bash
scripts/install.sh                                      # installs in ~/.local/opt/rakun the tarball of your architecture from dist/

rakun                                                  # in the foreground, Ctrl+C stops it
systemd-run --user --unit=rakun ~/.local/opt/rakun/rakun   # in the background, transient
rakunctl start | stop                                         # alternative without systemd
rakunctl -s library                                           # starts it if needed and stops it afterwards
systemctl --user stop rakun                            # stops the background one
rakunctl install-service | uninstall-service           # user service: starts at login (not Zoom: no screen)
```

To reinstall a new version: `pnpm package`, run `scripts/install.sh …` again and restart rakun. The logins are kept (they live in `~/.config/rakun`) and so are the helper binaries (`~/.local/share/rakun/bin`).

The normal tarball has no helper binaries (legendary, gogdl, nile…): after the first install run `rakunctl helpers update` (and `rakunctl helpers` to see what is there). rakun starts without them and says what is missing: in the log, in `rakunctl status` and in the web, which has a notice with a Download button and a _Helper binaries_ screen in the menu. `pnpm package --full` makes one that carries them, and `scripts/install.sh --full` installs it.

To test without touching your real `$HOME` (**with a directory that exists and is not empty**: with an empty `HOME=` rakun creates its folders in the current directory):

```bash
HOME=$(mktemp -d) RAKUN_PORT=17999 rakun
HOME=<that same directory> RAKUN_API_FILE=<that>/.config/rakun/api.json scripts/smoke.sh
```

## rakunctl

With rakun installed, `rakunctl` (or `pnpm start:ctl` from the repository) saves you from typing the JSON by hand. It uses the same `api.json` and the same `RAKUN_API_FILE` variable.

| You want to…                       | `rakunctl`                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| start / stop rakun                 | `rakunctl start` / `rakunctl stop [--force]`                                                                                  |
| choose web and port                | `rakunctl start --web local\|network\|off --port N` (or `config webAccess`)                                                   |
| see if it is alive                 | `rakunctl status` (says "rakun is stopped" if it is not)                                                                      |
| log in                             | `rakunctl login gog` (epic, gog, amazon, zoom)                                                                                |
| list the library                   | `rakunctl library [store] [--installed]`                                                                                      |
| refresh it and wait                | `rakunctl refresh [store]`                                                                                                    |
| install                            | `rakunctl install gog <appName> [--path DIR] [--lang CODE] [--skip-dlcs] [--platform windows\|linux]`                         |
| see / download the helper binaries | `rakunctl helpers` / `rakunctl helpers update [--latest]` (the pinned versions, checked by sha256; `--latest` is not checked) |
| list the versions of a game        | `rakunctl versions gog <appName>` (GOG only: builds, branches, the current one marked)                                        |
| import a game from a folder        | `rakunctl import <store> <appName> <folder> [--platform windows\|linux]` (not Zoom)                                           |
| update                             | `rakunctl update [store [appName]]`: one game, a store's games or every game with a new version (Zoom is not updated)         |
| repair                             | `rakunctl repair <store> <appName>`                                                                                           |
| uninstall                          | `rakunctl uninstall <store> <appName>`                                                                                        |
| see the queue                      | `rakunctl queue`                                                                                                              |
| pause / resume / cancel            | `rakunctl pause` / `resume` / `cancel [--remove-files]`                                                                       |
| empty the finished list            | `rakunctl queue clear`                                                                                                        |
| see or change settings             | `rakunctl config [key [value]]` (e.g. `config protonPath PATH`)                                                               |
| read the logs                      | `rakunctl logs [store [appName]] [--type install]`                                                                            |
| clear the cache                    | `rakunctl cache clear [store]`                                                                                                |
| delete sessions, settings          | `rakunctl reset [--yes]` (stops rakun; games are not touched)                                                                 |
| follow the events                  | `rakunctl events`                                                                                                             |
| any other channel                  | `rakunctl call <channel> '[args]'`                                                                                            |

`install`, `update`, `repair` and `uninstall` wait until they finish and return a non-zero code if they fail (`--no-wait` to not wait). `--json` gives the output for scripts. `-s` in front of any command that ends (it does not work with `events` or `--no-wait`) starts rakun if it was stopped and stops it afterwards; if it was already running, it does not touch it. `install` of an already installed game is refused ("is already installed: use repair or update"). On GOG, `install --build ID [--branch NAME]` installs that version and `update --build ID` (one game) moves it there; both pin the version, so `rakunctl update` for everything does not move it again (with `--no-wait` the pin is not set). Epic, Amazon and Zoom always use the latest. `import` registers a game that is already on the disk (it also adds it to Steam); `import` checks that the game ended up installed, besides what rakun answers. `uninstall` deletes the game's files. `--lang` chooses the install language (on GOG, `en-US` if not given). A game with a Windows and a Linux build gets the Linux one unless `--platform windows` says otherwise (a build the game does not have is refused). DLCs are installed by default; `--skip-dlcs` skips them.

## Argument format

Arguments are **JSON**: strings carry double quotes inside the array, and the whole array goes in single quotes.

```bash
scripts/smoke.sh getLoginInfo '["gog"]'     # right
scripts/smoke.sh getLoginInfo '[gog]'       # wrong: HTTP 400 (invalid JSON)
```

With no arguments the second parameter is omitted: `scripts/smoke.sh getAccounts`.

## 1. Is it alive?

```bash
scripts/smoke.sh
```

It must show the version, the queue as `idle`, the library (`[]` if there is no session yet) and a `403` at the end (channel not exposed). If it says it cannot find `api.json`, rakun is not running with your `HOME`.

## 2. Log in to each store

Ask for the login URL and open it in the browser:

```bash
scripts/smoke.sh getLoginInfo '["gog"]'     # also: legendary, nile, zoom (see getStores)
```

Log in and paste what the browser leaves at the end:

```bash
scripts/smoke.sh submitLogin '["gog","https://embed.gog.com/on_login_success?...&code=XXXX"]'
```

It must answer `{"result":{"ok":true}}`.

| Store              | What to paste                                             |
| ------------------ | --------------------------------------------------------- |
| `legendary` (Epic) | the JSON the page shows (or just the `authorizationCode`) |
| `gog`              | the final address, even if the page looks blank           |
| `nile` (Amazon)    | the final address; call `getLoginInfo '["nile"]'` first   |
| `zoom`             | the final address with `li_token`, or the bare token      |

Check the session:

```bash
scripts/smoke.sh getAccounts                # who is logged in to each store
scripts/smoke.sh getStores                  # the stores rakun supports
```

To log out of a store: `scripts/smoke.sh logout '["gog"]'`.

If it fails:

- `"No login code found in what was pasted"`: the address has no `code=`. Try pasting just the value of the code.
- `"The store rejected the login"`: the code was already used or has expired (it is valid for a few minutes and only once). Repeat with a new one.
- Another error: look at `~/.local/state/Rakun/logs/rakun.log`.

## 3. Library

After the login, that store refreshes by itself. To ask for it:

```bash
scripts/smoke.sh getLibrary '["gog"]' | python3 -m json.tool | head -40
```

To force a refresh:

```bash
scripts/smoke.sh refreshLibrary '["gog"]'   # returns at once
scripts/smoke.sh getRefreshingLibraries     # ["gog"] while it works
scripts/smoke.sh --events                   # in another terminal: "refreshLibrary" arrives when it ends
```

`refreshLibrary` does not wait for it to finish (GOG can take more than a minute with hundreds of games) and a refresh already running for that store is joined, not repeated. When the event arrives, call `getLibrary` again.

Note the `app_name` and the `runner` of a small game for the next step.

## 4. Install a game

`install` takes the full `gameInfo`; the easiest is to get it from `getGameInfo`:

```bash
APP=1584866499; RUNNER=gog     # example: Beat Cop (GOG, Linux native)
INFO=$(scripts/smoke.sh getGameInfo "[\"$APP\",\"$RUNNER\"]" | python3 -c "import sys,json;print(json.dumps(json.load(sys.stdin)['result']))")
scripts/smoke.sh install "[{\"appName\":\"$APP\",\"runner\":\"$RUNNER\",\"path\":\"$HOME/Games/Rakun\",\"platformToInstall\":\"linux\",\"installLanguage\":\"en-US\",\"gameInfo\":$INFO}]"
```

For a Windows game, `"platformToInstall":"Windows"`.

## 5. Follow the progress

In another terminal:

```bash
scripts/smoke.sh --events                   # progressUpdate, gameStatusUpdate, ...
scripts/smoke.sh getDMQueueInformation      # state of the queue
```

When it finishes, the game must show up in Steam with its name and the log must say `Saved shortcut`.

## Steam covers (SteamGridDB)

Without a SteamGridDB key rakun does not download the images when it adds a game to Steam (the key is rakun's own, it is not inherited from Relic).

```bash
scripts/smoke.sh steamgriddb.hasApiKey                  # {"result":false} if missing
scripts/smoke.sh steamgriddb.setApiKey '["YOUR_KEY"]'
```

A game installed before setting the key has to be reinstalled to get them.

## 6. Uninstall, repair and other actions

```bash
scripts/smoke.sh uninstall "[\"$APP\",\"$RUNNER\",false]"   # true also deletes the game's folder
scripts/smoke.sh repair "[\"$APP\",\"$RUNNER\"]"
scripts/smoke.sh kill "[\"$APP\",\"$RUNNER\"]"            # aborts whatever it is doing
scripts/smoke.sh pauseCurrentDownload
scripts/smoke.sh resumeCurrentDownload
```

Zoom (experimental): **Windows** games open the installer wizard in a window, so rakun has to be started with a screen (desktop mode) and with `protonPath` set; without them the install ends in error. rakun checks it **before downloading** (with no `DISPLAY`, with the graphical server down or in game mode it fails at once and `rakunctl install` says why); it is a best-effort check: after switching between desktop and game mode, restart rakun. The Linux ones do not need a screen.

A shortcut added to Steam is **not removed** on uninstall: remove it by hand from the Steam library.

## The web and its modes

rakun serves its own web on the API port (`http://127.0.0.1:17370`). Who can open it:

| Mode              | How                                                     | What happens                                                                           |
| ----------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `local` (default) | nothing                                                 | this machine only                                                                      |
| `network`         | `rakunctl start --web network` or `rakun --web=network` | the whole network, **without protection** (warning in the log, `rakunctl` and the web) |
| `off`             | `--web off`                                             | the page is not served; the API stays on this machine                                  |

The parameter wins over the `RAKUN_WEB` variable, and this over the saved setting (`rakunctl config webAccess network`, which applies **when rakun restarts**). `--port N` / `RAKUN_PORT` change the port.

```bash
H=$(mktemp -d -p ~/.cache); [ -n "$H" ] || exit 1          # a temporary HOME that is NOT empty
env HOME=$H node build/rakunctl.cjs start --web network --port 17998
LAN=$(ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1 | head -1)
T=$(python3 -c "import json;print(json.load(open('$H/.config/rakun/api.json'))['token'])")

curl -s http://$LAN:17998/health                           # {"status":"ok",…,"web":"network"}
curl -s http://$LAN:17998/ | grep -o 'rakun-web" content="[a-z]*'      # network
curl -s -H "Host: evil.example:17998" http://$LAN:17998/health           # 403: Host not allowed
for c in setSetting listFolders getLogContent; do                         # 403 from the network
  curl -s -X POST -H "x-rakun-token: $T" -d '{"args":[]}' http://$LAN:17998/api/$c; echo
done
curl -s -X POST -H "x-rakun-token: $T" -d '{"args":["/usr"]}' http://127.0.0.1:17998/api/listFolders   # 200 from here
env HOME=$H node build/rakunctl.cjs stop; rm -rf "$H"
```

Coming in through the network IP from the machine itself counts as "network" (the socket is not loopback): it lets you test the block without another device. A busy port makes `rakunctl start` fail and name the log file (`~/.local/state/Rakun/logs/rakun.log`).

## Where to look if something fails

| What               | Where                                                             |
| ------------------ | ----------------------------------------------------------------- |
| General log        | `~/.local/state/Rakun/logs/rakun.log` (also why it did not start) |
| Log of a store     | `~/.local/state/Rakun/logs/runners/<store>.log`                   |
| Log of an install  | `~/.local/state/Rakun/logs/games/<app>_<runner>/install.log`      |
| Background process | `journalctl --user -u rakun -f` (with `systemd-run`)              |
| Any log            | `rakunctl logs [store [appName]] [--type install]`                |
| Port and token     | `~/.config/rakun/api.json` (`RAKUN_PORT` changes the port)        |
