# Commands

`rakunctl` talks to a running rakun over HTTP. It reads the port and token from `~/.config/rakun/api.json` (`RAKUN_API_FILE` points it at another file). Stores are `epic`, `gog`, `amazon` and `zoom`. `--json` prints for scripts.

Commands that change something (`install`, `update`, `repair`, `uninstall`) wait until they finish and exit non-zero if they fail; `--no-wait` skips the wait.

## Starting and stopping

| Command                                        | What it does                                                   |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `start [--web local\|network\|off] [--port N]` | start rakun in the background                                  |
| `stop [--force]`                               | stop it (`--force` even if a download is running)              |
| `install-service [--web ...] [--port N]`       | systemd user service, started at every login                   |
| `uninstall-service`                            | stop it and remove the service                                 |
| `self-update [--check] [--force]`              | install the newest rakun (`--check`: only say if there is one) |
| `status`                                       | version, sessions, queue, helpers (or "rakun is stopped")      |
| `-s <command>`                                 | run one command with rakun up, then stop it again              |

### `-s`: start only while a command runs

- It works with any command that ends (not `events`, nor `--no-wait`).
- Several `-s` at once are safe: rakun stops when the **last** one finishes, and only if a `-s` started it.
- A rakun you started yourself, or systemd did, is never stopped by `-s`.
- The files `-s` uses to coordinate live in `~/.local/state/Rakun/serve/`.

### `self-update`

Updates **rakun itself** (`update` updates games). It looks at the newest [GitHub release](https://github.com/FranjeGueje/rakun/releases), and if it is newer than the one you have it installs it:

```bash
rakunctl self-update --check     # only say if there is a new version (--json: current, latest, updateAvailable)
rakunctl self-update             # install it
```

- It stops rakun if it runs (not while it is downloading or refreshing the library: pause or cancel first, or use `--force`), installs the tarball with the `install.sh` that comes in it, and starts rakun again. If a service is installed, the service is started. A rakun that was stopped stays stopped. A `--web` or `--port` you gave to `start` by hand is not kept: rakun starts with the saved `webAccess` setting and `RAKUN_PORT`.
- The tarball is checked against its `.sha256`; if the checksum does not match, nothing is replaced and the old rakun runs again.
- Your logins, settings and helper binaries are not touched. A new rakun can pin other helper versions: the command ends with the helpers line of `status`, and `rakunctl helpers update` downloads what is missing.
- It only updates an install made by `install.sh` (`~/.local/opt/rakun`), and only x64 builds are published. A rakun inside another package (an AppImage, another client) is updated the way it was installed.
- It cannot be used with `-s`: it does not need rakun running. rakun itself never asks GitHub: only this command does, when you run it.

### `install-service`

It writes `~/.config/systemd/user/rakun.service` (`Restart=on-failure`) and runs `systemctl --user enable --now`. Do not mix it with `systemd-run --unit=rakun`: both are called `rakun`.

> [!WARNING]
> The service has no `DISPLAY`, so **Zoom's Windows installers do not work with it**. And with `webAccess=network`, the web would be open to the network, unprotected, at every login. The command warns about both.

## Accounts and helpers

| Command                            | What it does                                                    |
| ---------------------------------- | --------------------------------------------------------------- |
| `login <store>` / `logout <store>` | log in (paste what the browser ends on) / out                   |
| `helpers`                          | which helper binaries are installed                             |
| `helpers update [--latest]`        | download the missing ones (`--latest`: newest, **not checked**) |

## Library and games

| Command                                                     | What it does                               |
| ----------------------------------------------------------- | ------------------------------------------ |
| `library [store] [--installed]`                             | list the library                           |
| `refresh [store]`                                           | refresh it and wait                        |
| `install <store> <app> [options]`                           | install (see below)                        |
| `versions <store> <app>`                                    | builds and branches of a GOG game          |
| `import <store> <app> <folder> [--platform windows\|linux]` | register a game already on disk (not Zoom) |
| `update [store [app]] [--build ID]`                         | update one game, a store's, or everything  |
| `repair <store> <app>`                                      | repair one game                            |
| `uninstall <store> <app>`                                   | uninstall one game                         |

### Install options

| Option                        | Meaning                                                  |
| ----------------------------- | -------------------------------------------------------- |
| `--path DIR`                  | install folder (default: `defaultInstallPath`)           |
| `--lang CODE`                 | install language (GOG: `en-US` if not given)             |
| `--platform windows\|linux`   | which build, for a game that has both (Linux by default) |
| `--skip-dlcs`                 | do not install the DLCs                                  |
| `--build ID`, `--branch NAME` | GOG only: install that version, see `versions`           |
| `--no-wait`                   | return at once instead of waiting                        |

## Download queue

| Command                   | What it does                             |
| ------------------------- | ---------------------------------------- |
| `queue` / `queue clear`   | show the queue / empty the finished list |
| `pause`, `resume`         | pause or resume the current download     |
| `cancel [--remove-files]` | cancel the current download              |

## Settings, logs, maintenance

| Command                         | What it does                                                         |
| ------------------------------- | -------------------------------------------------------------------- |
| `config [key [value]]`          | list, read or change settings, see [Configuration](Configuration.md) |
| `logs [store [app]] [--type T]` | rakun's log, a store's, or one game's                                |
| `cache clear [store]`           | empty library caches                                                 |
| `reset [--yes]`                 | forget sessions and settings (stops rakun; games are not touched)    |
| `events`                        | follow rakun's events live                                           |
| `call <channel> [json]`         | call any exposed API channel, see [API](../API.md)                   |

---

Next: [Configuration](Configuration.md) · [User guide](User-Guide.md)
