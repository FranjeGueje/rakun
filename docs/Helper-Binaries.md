# Helper binaries

rakun does not talk to the stores itself: it runs other programs for each one.

| Program      | Used for                                                                         |
| ------------ | -------------------------------------------------------------------------------- |
| legendary    | Epic Games                                                                       |
| gogdl, Comet | GOG (Comet: achievements, experimental)                                          |
| nile         | Amazon Games                                                                     |
| umu          | Proton prefixes                                                                  |
| butler       | itch.io (its daemon, with 7z.so and libc7zip.so; from itch's server, not GitHub) |

The normal tarball does not carry them. Right after installing, run:

```bash
rakunctl helpers            # which ones are installed: HELPER, PINNED, INSTALLED, STATE
rakunctl helpers update     # download the missing ones (starts rakun for the time it takes)
```

`unzip` is needed to unpack some of them.

## Which versions

- `helpers update` downloads the versions rakun was **tested with** and checks each file against its `sha256`. A file that does not match is not installed.
- `helpers update --latest` downloads the newest release of each one instead.

> [!NOTE]
> `--latest` does not move butler: it comes from itch's server, not from GitHub, and `helpers update` always installs the pinned version. butler needs `7z.so` and `libc7zip.so` next to it; without any of the three it counts as missing.

> [!WARNING]
> `--latest` checks nothing. rakun reads the output of these programs, so a new version can break it. Use it at your own risk.

## What rakun does when a helper changes what it prints

rakun reads the output of legendary, gogdl and nile, and a new version can change it. What it does not do is trust it blindly:

- **The exit code counts.** An install, update, repair or uninstall whose helper ended with a code other than 0 is an error, and nothing is saved as installed (gogdl, for instance, ends with 2 and says «Not enough disk space» when the disk is full). Some changes do not show in the code (a helper that does not know a renamed flag prints its usage and ends with 0), so GOG also needs files in the game folder and Amazon needs nile to have recorded the install.
- **What is saved is checked first.** The JSON that feeds the library or the install info is checked for the parts rakun reads; if it has another shape, rakun says which helper and command, shows a sample (with no tokens), keeps what it had, and does not take it for «no games».
- **It tells you.** The first time, the log says it; `rakunctl status` and `rakunctl helpers` show it next to the helper; and at start the log names every helper that is not the tested version.
- **A surprise never logs you out.** A session is only marked expired by an explicit refusal of the store, never by output rakun does not understand.

## Updating a helper (for who maintains rakun)

1. Change the tag and the `sha256` in `src/backend/rakun/helpers/manifest.ts`.
2. Run `scripts/capture-helper-fixtures.sh`. It runs legendary, gogdl and nile with an **empty** configuration (no login, nothing of yours) in the cases rakun depends on and saves what they print and their exit codes in `src/backend/storeManagers/__tests__/helper_fixtures/<helper>-<tag>/`.
3. **Read the diff of those files**: a changed line is a change in what the helper prints, and the parsers may have to change with it. Delete the folder of the old version.
4. `pnpm test`: `helper_contract.test.ts` fails if a pinned helper has no fixtures, and checks the exit codes and words rakun relies on.

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
