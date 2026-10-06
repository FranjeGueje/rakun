# Changelog

El historial de Relic (y de la limpieza de Heroic) está en el repositorio
`upstream`. / The history of Relic (and of the Heroic cleanup) lives in the
`upstream` repository.

## 0.1.0 — Headless

### Español

#### Añadido

- **relicd**, fork solo backend de Relic: servicio Node sin Electron ni ventana,
  con identidad propia (`~/.config/relicd`, `~/.cache/relicd`,
  `~/.local/state/Relicd`, `~/.local/share/relicd`, `~/Games/Relicd`).
- **API HTTP local** (`127.0.0.1`, puerto 17370 o `RELICD_PORT`): `POST
/api/<canal>`, `GET /events` (SSE) y `GET /health`. Token en
  `~/.config/relicd/api.json` (modo 0600), solo cabeceras locales (sin `Origin`,
  `Host` de loopback) y lista blanca de canales y eventos. Documentada en
  `API.md`.
- **`getLibrary`**: biblioteca de una o todas las tiendas con el estado de
  instalación y los overrides (antes la leía el frontend de los stores).
- **`refreshLibrary` no bloquea**: responde al instante, refresca en segundo
  plano, une las peticiones de una tienda que ya se está refrescando y avisa con
  el evento `refreshLibrary` al terminar; `getRefreshingLibraries` dice qué
  tiendas están refrescando.
- **Login sin ventana**: `getLoginInfo` da la URL de login y `submitLogin`
  acepta la dirección final, el JSON de Epic o el código suelto.
- **`scripts/package.sh`**: tarball `relicd-<v>-linux-x64.tar.gz` (+ `.sha256`)
  con el bundle de esbuild, los binarios auxiliares y un Node 24 propio
  verificado contra su checksum. **`scripts/install.sh`** lo instala en
  `~/.local/opt/relicd` sin crear ningún servicio. **`scripts/smoke.sh`**
  comprueba un relicd en marcha.

#### Cambiado

- `ipc.ts` pasa a registros en memoria en lugar de `ipcMain`; los handlers de
  `main.ts` se reparten en `relic/api/` y el arranque está en `relic/daemon.ts`.
- GPU por `lspci` (antes `app.getGPUInfo`); `online_monitor` sin `net`;
  `os.release()` en lugar de `process.getSystemVersion()`.
- Los diálogos se registran y se publican como evento `showDialog`;
  `askQuestion` elige siempre la primera opción (la segura).
- `review.sh` y `release.sh` construyen el tarball; `release.sh` solo publica en
  GitHub si se define `RELICD_REPO`.

#### Eliminado

- Electron, el frontend (React), el preload, la ventana principal, la bandeja,
  `images_cache`, Playwright, electron-vite, electron-builder y sus
  dependencias; los canales de ventana, atajos, portapapeles, gamepad y zoom.

### English

#### Added

- **relicd**, a backend-only fork of Relic: a Node service with no Electron and
  no window, with its own identity (`~/.config/relicd`, `~/.cache/relicd`,
  `~/.local/state/Relicd`, `~/.local/share/relicd`, `~/Games/Relicd`).
- **Local HTTP API** (`127.0.0.1`, port 17370 or `RELICD_PORT`): `POST
/api/<channel>`, `GET /events` (SSE) and `GET /health`. Token in
  `~/.config/relicd/api.json` (mode 0600), local-only requests (no `Origin`,
  loopback `Host`) and an allow list of channels and events. Documented in
  `API.md`.
- **`getLibrary`**: the library of one or all stores with install state and
  overrides (the frontend used to read it from the stores).
- **`refreshLibrary` does not block**: it answers at once, refreshes in the
  background, joins requests for a store that is already refreshing and fires
  the `refreshLibrary` event when done; `getRefreshingLibraries` tells which
  stores are refreshing.
- **Window-less login**: `getLoginInfo` returns the login URL and `submitLogin`
  takes the final address, Epic's JSON or the bare code.
- **`scripts/package.sh`**: `relicd-<v>-linux-x64.tar.gz` (+ `.sha256`) with the
  esbuild bundle, the helper binaries and its own Node 24 checked against its
  checksum. **`scripts/install.sh`** installs it to `~/.local/opt/relicd`
  without creating any service. **`scripts/smoke.sh`** checks a running relicd.

#### Changed

- `ipc.ts` moves to in-memory registries instead of `ipcMain`; the handlers of
  `main.ts` are split into `relic/api/` and start-up lives in `relic/daemon.ts`.
- GPU through `lspci` (was `app.getGPUInfo`); `online_monitor` without `net`;
  `os.release()` instead of `process.getSystemVersion()`.
- Dialogs are logged and published as a `showDialog` event; `askQuestion` always
  picks the first (safe) option.
- `review.sh` and `release.sh` build the tarball; `release.sh` only publishes to
  GitHub when `RELICD_REPO` is set.

#### Removed

- Electron, the React frontend, the preload, the main window, the tray,
  `images_cache`, Playwright, electron-vite, electron-builder and their
  dependencies; the window, shortcut, clipboard, gamepad and zoom channels.
