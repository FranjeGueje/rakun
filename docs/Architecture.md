# Architecture

rakun is a Node service with no window. It is a fork of Relic, itself a Linux-only fork of Heroic Games Launcher, with Electron removed and an HTTP API in its place.

```
client (web, rakunctl, Invasor module, scripts/smoke.sh)
   │  HTTP 127.0.0.1 + token   (see API.md)
   ▼
rakun/server  ──►  ipc.ts  (registry of handlers and events, no Electron)
                     │
         rakun/api/  (system, accounts, settings, games, library, login)
                     │
  storeManagers · downloadmanager · utils · rakun/ (Steam integration)
                     │
        helper programs: legendary, gogdl, nile, comet, umu
```

## Source layout

| Path                                                                                              | What it is                                                               |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/backend/rakun/main.ts`, `daemon.ts`                                                          | Startup: logger, migrations, stores, server, download queue              |
| `src/backend/ipc.ts`                                                                              | `addHandler` / `addListener` / `sendFrontendMessage` over in-memory maps |
| `src/backend/rakun/server/`                                                                       | HTTP server, token, web access rules, `allowlist.ts`, static web         |
| `src/backend/rakun/api/`                                                                          | The handlers every client uses (including the windowless login)          |
| `src/backend/storeManagers/<store>/`                                                              | One folder per store: library, games, user, store descriptor             |
| `src/backend/downloadmanager/`                                                                    | The download queue                                                       |
| `src/backend/rakun/steam_shortcuts/`, `steamgrid/`, `prefix.ts`, `windowify.ts`, `game_events.ts` | Steam integration, see [Steam integration](Steam-Integration.md)         |
| `src/backend/rakun/helpers/`                                                                      | Helper binaries: tested versions, `sha256`, download and locations       |
| `src/rakunctl/`                                                                                   | The command line client; it only speaks HTTP and is bundled separately   |
| `src/common/`                                                                                     | Types shared by all of them                                              |
| `web/`                                                                                            | rakun's own web (React), its own tsconfig and tests                      |

## Rules the code follows

- **A channel is reachable over HTTP only if it is in `allowlist.ts`.** When you add or change one, update `allowlist.ts` and [API](../API.md) together.
- Settings are validated in `rakun/settings_validation.ts`, never in the client.
- No Electron imports. The bundle must not require `electron`.
- Strict TypeScript, no `any` in new code; public functions are one short flow and the details go in helpers that are tested on their own.

## Adding a store

A store is a folder plus one line in the registry.

1. In `src/backend/storeManagers/<store>/` create `library.ts` (a `LibraryManager`), `games.ts` (a `Game`), `user.ts` (the session) and `store.ts` (the `Store` descriptor of `storeManagers/store.ts`: id, name, how to read the library, session and login). `legendary/` and `gog/` are good models.
2. Add the id to `Runner` in `src/common/types.ts`.
3. Add it to `stores` in `storeManagers/index.ts` (the order is the one clients see).
4. Run `pnpm codecheck`: the types point out what is missing (`RunnerToLogPrefixMap`, `LogPrefix`, `storeMap`, `STORE_CONFIGS`).
5. Run `pnpm test`: the "store contract" test (`storeManagers/__tests__/store_adapters.test.ts`) checks every store in the registry.
6. Review by hand what compares `runner` with `===` or `switch`: the Steam integration, the download queue, `runner_call.ts`, `utils.ts` and `rakun/api/games.ts`. `grep -rn "runner ===" src/backend` finds them.

---

Next: [Development](Development.md) · [API](../API.md)

## The web and its host

The web (`web/`) does not import anything from the backend: it talks to rakun only through `window.rakun`, a bridge object (`RakunBridge` in `web/src/api/bridge.ts`). In a browser the page builds that bridge itself over `fetch` and the token that came with `index.html`. A desktop app that embeds the web can provide its own bridge instead.

Five members are always there: `call`, `connection`, `onEvent`, `onConnection` and `setSetting`. The rest are optional, and the interface only offers what the host provides:

| Member         | When present, the interface shows                                |
| -------------- | ---------------------------------------------------------------- |
| `appName`      | the app's name in the header instead of rakun's lettering        |
| `quit`, `owns` | a Quit button and key, with a dialog about what happens to rakun |
| `start`        | a **Start rakun** button when rakun does not answer              |
| `login`        | login through a window of the host, without pasting              |
| `loginPaste`   | the paste flow (the default in a browser, where it is provided)  |

Without the optional members the web behaves as a plain browser page.
