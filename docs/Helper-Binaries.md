# Helper binaries

rakun does not talk to the stores itself: it runs other programs for each one.

| Program                 | Used for                                |
| ----------------------- | --------------------------------------- |
| legendary               | Epic Games                              |
| gogdl, Comet            | GOG (Comet: achievements, experimental) |
| nile                    | Amazon Games                            |
| umu                     | Proton prefixes                         |
| Zoom's installer script | Zoom Platform                           |

The normal tarball does not carry them. Right after installing, run:

```bash
rakunctl helpers            # which ones are installed: HELPER, PINNED, INSTALLED, STATE
rakunctl helpers update     # download the missing ones (starts rakun for the time it takes)
```

`unzip` is needed to unpack some of them.

## Which versions

- `helpers update` downloads the versions rakun was **tested with** and checks each file against its `sha256`. A file that does not match is not installed.
- `helpers update --latest` downloads the newest release of each one instead.

> [!WARNING]
> `--latest` checks nothing. rakun reads the output of these programs, so a new version can break it. Use it at your own risk.

Zoom's installer script is the only one that cannot be checked: its address has no version, so there is no `sha256` to compare. It comes from Zoom's own site and counts as installed whatever version it says.

## Where they go

| What                 | Where                                                                        |
| -------------------- | ---------------------------------------------------------------------------- |
| Linux tools          | `~/.local/share/rakun/bin` (they survive a rakun update)                     |
| Windows `.exe` files | `~/.local/share/rakun/mount/bin`, seen by the prefixes as `C:\Launchers\bin` |

With a `-full` tarball nothing needs downloading: rakun puts what it carries in place when it starts.

## When some are missing

rakun **starts anyway** and tells you:

- a warning in the log;
- a line in `rakunctl status` (`Helpers: all installed`, or what is missing or not at the tested version, and what to run);
- in the web, a notice with a **Download** button, and a _Helper binaries_ screen in the menu with the state of each one (_Download missing_, _Download latest_).

A command that needs a helper that is not there fails and says how to install it.

Any client can ask rakun to update them (`updateHelpers`, see [API](../API.md)). With `webAccess` set to `network`, that request is only answered to the machine itself.

---

See also: [Getting started](Getting-Started.md) · [Troubleshooting](Troubleshooting.md)
