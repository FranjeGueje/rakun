# Getting started

From nothing to a game in Steam. You need Linux, Steam and a terminal. Windows games also need GE-Proton (see [Requirements](#requirements)).

## 1. Install

Install the latest release (x64, bash):

```bash
V=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/FranjeGueje/rakun/releases/latest); V=${V##*/}; curl -fsSL https://raw.githubusercontent.com/FranjeGueje/rakun/$V/scripts/install.sh | bash -s -- https://github.com/FranjeGueje/rakun/releases/download/$V/rakun-${V#v}-linux-x64.tar.gz
```

Or build the tarball yourself (see [Development](Development.md)):

```bash
git clone https://github.com/FranjeGueje/rakun.git && cd rakun
pnpm install
pnpm package                     # dist/rakun-<version>-linux-<arch>.tar.gz
scripts/install.sh               # picks the tarball of this machine from dist/
```

`install.sh` requires the `.sha256` file that `pnpm package` leaves next to the tarball, and refuses to install if it is missing or does not match.

The tarball carries its own Node, so nothing else is needed on SteamOS. The installer puts rakun in `~/.local/opt/rakun` and links `rakun` and `rakunctl` in `~/.local/bin`. It creates **no service**.

For a machine with no network, `pnpm package --full` also builds a `-full` tarball that carries the [helper binaries](Helper-Binaries.md); install it with `scripts/install.sh --full`.

## 2. Start rakun

```bash
rakunctl start                   # in the background
rakunctl status                  # is it alive? what is missing?
rakunctl stop                    # stop it (--force if a download is running)
```

Other ways: `rakun` runs it in the foreground (Ctrl+C stops it); `rakunctl -s <command>` starts it only while that command runs; `rakunctl install-service` makes it a systemd user service that starts at every login. See [Commands](Commands.md#starting-and-stopping).

## 3. Download the helper binaries

```bash
rakunctl helpers update
```

rakun starts without them and says what is missing, but it cannot talk to the stores until they are there. Details in [Helper binaries](Helper-Binaries.md).

## 4. Log in

```bash
rakunctl login gog               # epic, gog, amazon or zoom
```

rakun prints a login address. Open it in any browser, log in, and paste back what the browser ends on (the final address, or the code). There is no embedded browser. What to paste for each store:

| Store    | What to paste                                             |
| -------- | --------------------------------------------------------- |
| `epic`   | the JSON the page shows (or just the `authorizationCode`) |
| `gog`    | the final address, even if the page looks blank           |
| `amazon` | the final address                                         |
| `zoom`   | the final address with `li_token`, or the bare token      |

## 5. Install a game

```bash
rakunctl library gog             # find the app name
rakunctl install gog <appName>
```

The command waits until it finishes. When it does, the game is in Steam. For a Windows game, open its properties in Steam → Compatibility and force GE-Proton once.

You can do all of this in the web too: open `http://127.0.0.1:17370` in a browser on the same machine.

![The install dialog of the web](images/install.png)

## Requirements

- Linux and Steam
- `curl`, `xdg-open` and `unzip`
- For Windows games, GE-Proton in `~/.local/share/Steam/compatibilitytools.d` (rakun picks the first `*proton*` folder; change it with `rakunctl config protonPath <folder>`)
- For Zoom Platform's **Windows** games, a screen (`DISPLAY`): the installer is a normal Windows wizard. rakun checks this before downloading and refuses at once without one, or in Steam's game mode. Zoom support is experimental; its Linux installers do not need a screen.

---

Next: [User guide](User-Guide.md) · [Commands](Commands.md)
