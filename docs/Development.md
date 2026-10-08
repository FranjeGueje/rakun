# Development

## Requirements

Node 24 or newer, [pnpm](https://pnpm.io) 11 (see `packageManager` in `package.json`), git, `curl` and `unzip`. Nothing else: there is no Electron.

## Build and run

```bash
pnpm install
pnpm build                       # build/rakun.cjs, build/rakunctl.cjs and build/web/
pnpm start                       # runs the daemon from the checkout
pnpm start:ctl status            # runs rakunctl from the checkout
```

`pnpm build` is `build:daemon` + `build:ctl` + `build:web`, each one an esbuild bundle. `rakun.cjs` serves the web from `build/web` (`RAKUN_WEB_DIR` points it elsewhere).

## Check your work

```bash
pnpm test                        # Jest (backend, rakunctl and web in a jsdom project)
pnpm codecheck                   # tsc for the backend and for web/
pnpm lint                        # eslint
pnpm prettier                    # formatting check (pnpm prettier-fix writes it)
```

The pre-commit hook runs `eslint --fix` on `src/` and `web/`: an unused import breaks the commit.

## Package

```bash
pnpm package [x64|arm64|all] [--full]
```

Leaves `dist/rakun-<version>-linux-<arch>.tar.gz` (+ `.sha256`) with its own Node and the web, and **no helper binaries**. `--full` also leaves a `-full` tarball with them; for that, run `pnpm download-helper-binaries` first (it fills `public/bin`, which is not in git). `scripts/install.sh` installs the one for this machine.

## Try it without touching your real data

```bash
H=$(mktemp -d); [ -n "$H" ] || exit 1          # must exist and not be empty
HOME=$H RAKUN_PORT=17999 pnpm start
```

With an empty `HOME=` rakun would create its folders in the current directory. For a manual walkthrough see [Testing](Testing.md); `scripts/smoke.sh` and `rakunctl status` check a running instance.

## Helper versions

`src/backend/rakun/helpers/manifest.ts` lists the versions rakun was tested with and the `sha256` of each file. A new version of a helper is a change of rakun: bump it there.

---

Next: [Architecture](Architecture.md) · [Testing](Testing.md)
