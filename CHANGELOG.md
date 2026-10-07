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
- **`steamgriddb.hasApiKey` y `steamgriddb.setApiKey`** expuestos en la API:
  sin clave de SteamGridDB no se descargan las portadas al añadir un juego.
- **`getAccounts`**: quién tiene sesión en cada tienda y con qué nombre, sin
  red.
- **Login sin ventana**: `getLoginInfo` da la URL de login y `submitLogin`
  acepta la dirección final, el JSON de Epic o el código suelto.
- **`scripts/package.sh`**: tarball `relicd-<v>-linux-x64.tar.gz` (+ `.sha256`)
  con el bundle de esbuild, los binarios auxiliares y un Node 24 propio
  verificado contra su checksum. **`scripts/install.sh`** lo instala en
  `~/.local/opt/relicd` sin crear ningún servicio. **`scripts/smoke.sh`**
  comprueba un relicd en marcha.
- **`relicctl`**, cliente de línea de comandos (solo habla HTTP con relicd):
  `status`, `login`/`logout`, `import-relic`, `library`, `refresh`,
  `install`/`update`/`repair`/`uninstall` (esperan a que acabe; `--lang`,
  `--skip-dlcs`, `--no-wait`), `queue`, `pause`/`resume`/`cancel`, `config`,
  `logs`, `cache clear`, `reset`, `events`, `call` y `--json`. Las tiendas salen
  de `getStores`, así que añadir una no toca `relicctl`.
- **`relicctl start`, `stop` y `-s`**: arrancar y parar relicd sin systemd.
  `relicctl -s <comando>` lo arranca si está parado y lo para al acabar; con
  varios `-s` a la vez lo para el último, y solo si lo arrancó un `-s`.
  Si relicd está parado, los demás comandos lo dicen.
- **Ajustes globales validados** (`setSetting`/`writeConfig`): una clave
  desconocida, un tipo erróneo, un idioma no soportado, `maxWorkers` fuera de
  rango o una ruta inexistente responden `500` con el motivo. Cambiar `language`
  surte efecto al instante. `getMaxCpus` indica el máximo de `maxWorkers`.
- **`clearCache`, `resetRelic` y `stopRelicd`** en la API. `resetRelic` olvida
  sesiones, ajustes y cola (no los juegos instalados ni `api.json`) y detiene
  relicd.
- **Cola de descargas**: `clearFinishedDMQueue`, y un fallo guarda su motivo en
  `DMQueueElement.error` (`relicctl install` lo muestra en vez de «mira los
  logs»).
- **`getStores` y `logout(runner)`** genéricos, `getLogContent` y
  `importSessionsFromRelic` (copia las sesiones de `~/.config/relic`), y la
  rama privada de GOG con las versiones de los binarios auxiliares.
- **Los DLC se instalan por defecto** en Epic y GOG (`installDlcs` omitido = todos,
  `[]` = ninguno, una lista = solo esos en GOG).
- **Zoom (experimental)**: relicd comprueba que hay pantalla antes de descargar
  un juego de Windows y falla al instante sin `DISPLAY`, con el servidor gráfico
  caído o en modo juego. La documentación explica que esos instaladores
  necesitan pantalla.
- **Una tienda es una carpeta más una línea en el registro** (descriptor
  `Store`), con un contrato de tests para todas y una guía en `AGENTS.md`.

#### Cambiado

- `ipc.ts` pasa a registros en memoria en lugar de `ipcMain`; los handlers de
  `main.ts` se reparten en `relic/api/` y el arranque está en `relic/daemon.ts`.
- GPU por `lspci` (antes `app.getGPUInfo`); `online_monitor` sin `net`;
  `os.release()` en lugar de `process.getSystemVersion()`.
- Los diálogos se registran y se publican como evento `showDialog`;
  `askQuestion` elige siempre la primera opción (la segura).
- `review.sh` y `release.sh` construyen el tarball; `release.sh` solo publica en
  GitHub si se define `RELICD_REPO`.
- Un solo tarball por arquitectura: `pnpm package [x64|arm64|all]` genera
  `relicd-<v>-linux-<arch>.tar.gz`, cada uno solo con sus binarios y su Node.
- Sin traducciones: los mensajes del daemon van en inglés; `language` solo elige
  el idioma por defecto de GOG.
- Los comandos de `relicctl` ya no dicen «¿está arrancado?»: dicen «relicd
  parado» y cómo arrancarlo.
- El registro de la API deja de tener canales por tienda (`login`, `authGOG`,
  `isLoggedIn`, `logoutLegendary`…): se usan `getStores`, `getAccounts`,
  `getLoginInfo`, `submitLogin` y `logout`.

#### Corregido

- **Zoom: una descarga cortada dejaba un instalador truncado** que el siguiente
  intento daba por bueno. Ahora se descarga a un `.part` y solo se renombra si
  llega entero.
- **`getLibrary` de Epic y Amazon** no reflejaba instalar o desinstalar hasta el
  siguiente refresco (sus stores solo se reescriben al refrescar); ahora se
  completa con el estado que mantiene cada manager.
- **Reparar un juego nativo de Linux** creaba un `.bat` que no le corresponde
  (su shortcut apunta a `start.sh`); ahora lo omite.
- **Reinstalar un juego cuyo prefijo se conservó** fallaba con `EEXIST` al crear
  los enlaces del prefijo, y se saltaba el resto de la preparación. Ahora
  reemplaza los enlaces existentes.
- **Zoom: un instalador de Windows que fallaba se daba por instalado**: el juego
  quedaba registrado y se añadía a Steam sin existir. Ahora la instalación
  termina en error. Cerrar la sesión de Zoom también vacía la biblioteca
  cacheada.
- **GOG: instalar sin idioma enviaba el texto «undefined» a gogdl**, que se caía.
  Usa `en-US` por defecto y guarda el idioma usado (`relicctl install --lang`).
- **Reinstalar un juego de GOG o Zoom (y los de terceros de Epic) repetía su
  registro** en `installed.json`: tres instalaciones dejaban tres entradas, y
  desinstalar solo quitaba una, así que el juego seguía figurando como instalado.
  Ahora hay una entrada por juego, desinstalar las quita todas y un refresco
  limpia los duplicados ya existentes. Además, quitar un juego de terceros que no
  estaba en la lista borraba el último.
- **Epic ignoraba `installDlcs`** y siempre pasaba `--skip-dlcs`.
- **`checkGameUpdates` avisaba de juegos ya encolados** por la actualización
  automática, y Amazon sin sesión se registraba como error (es el estado normal).

#### Eliminado

- Electron, el frontend (React), el preload, la ventana principal, la bandeja,
  `images_cache`, Playwright, electron-vite, electron-builder y sus
  dependencias; los canales de ventana, atajos, portapapeles, gamepad y zoom.
- i18next y las traducciones (`public/locales`), `easydl`, `tmp`, `undici`
  (el proxy lo gestiona `NODE_USE_ENV_PROXY`), el soporte e2e heredado de Relic,
  el parche de `@types/node` y código sin uso. `node_modules` pasa de 605 MB a
  171 MB.
- El Comet nativo de Linux (`getCometVersion`, `altCometBin`, el registro de
  `comet`); queda `comet.exe`, que corre dentro del prefijo.
- La configuración por juego (`GameConfig`, `GameSettings`), los mods de
  Cyberpunk, los guardados en la nube de GOG y los canales heredados de la
  interfaz.
- Los `.exe` de arm64 de Windows (nadie los usaba).

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
- **`steamgriddb.hasApiKey` and `steamgriddb.setApiKey`** exposed in the API:
  without a SteamGridDB key no artwork is downloaded when a game is added to
  Steam.
- **`getAccounts`**: who is logged in to each store and under what name, with
  no network.
- **Window-less login**: `getLoginInfo` returns the login URL and `submitLogin`
  takes the final address, Epic's JSON or the bare code.
- **`scripts/package.sh`**: `relicd-<v>-linux-x64.tar.gz` (+ `.sha256`) with the
  esbuild bundle, the helper binaries and its own Node 24 checked against its
  checksum. **`scripts/install.sh`** installs it to `~/.local/opt/relicd`
  without creating any service. **`scripts/smoke.sh`** checks a running relicd.
- **`relicctl`**, a command line client (it only talks HTTP to relicd):
  `status`, `login`/`logout`, `import-relic`, `library`, `refresh`,
  `install`/`update`/`repair`/`uninstall` (they wait until done; `--lang`,
  `--skip-dlcs`, `--no-wait`), `queue`, `pause`/`resume`/`cancel`, `config`,
  `logs`, `cache clear`, `reset`, `events`, `call` and `--json`. The stores come
  from `getStores`, so adding one does not touch `relicctl`.
- **`relicctl start`, `stop` and `-s`**: start and stop relicd without systemd.
  `relicctl -s <command>` starts it if stopped and stops it afterwards; with
  several `-s` at once the last one stops it, and only if a `-s` started it.
  With relicd stopped, every other command says so.
- **Validated global settings** (`setSetting`/`writeConfig`): an unknown key, a
  wrong type, an unsupported language, a `maxWorkers` out of range or a missing
  path answers `500` with the reason. Changing `language` takes effect at once.
  `getMaxCpus` gives the most `maxWorkers` can be.
- **`clearCache`, `resetRelic` and `stopRelicd`** in the API. `resetRelic`
  forgets sessions, settings and the queue (not the installed games nor
  `api.json`) and stops relicd.
- **Download queue**: `clearFinishedDMQueue`, and a failure keeps its reason in
  `DMQueueElement.error` (`relicctl install` prints it instead of "see the
  logs").
- **Generic `getStores` and `logout(runner)`**, `getLogContent` and
  `importSessionsFromRelic` (copies the sessions of `~/.config/relic`), and the
  GOG private branch with the helper binary versions.
- **DLCs are installed by default** on Epic and GOG (`installDlcs` omitted = all,
  `[]` = none, a list = only those on GOG).
- **Zoom (experimental)**: relicd checks there is a screen before downloading a
  Windows game and fails at once without `DISPLAY`, with the X server gone or in
  game mode. The docs explain that those installers need a screen.
- **A store is a folder plus one line in the registry** (`Store` descriptor),
  with a test contract for all of them and a guide in `AGENTS.md`.

#### Changed

- `ipc.ts` moves to in-memory registries instead of `ipcMain`; the handlers of
  `main.ts` are split into `relic/api/` and start-up lives in `relic/daemon.ts`.
- GPU through `lspci` (was `app.getGPUInfo`); `online_monitor` without `net`;
  `os.release()` instead of `process.getSystemVersion()`.
- Dialogs are logged and published as a `showDialog` event; `askQuestion` always
  picks the first (safe) option.
- `review.sh` and `release.sh` build the tarball; `release.sh` only publishes to
  GitHub when `RELICD_REPO` is set.
- One tarball per architecture: `pnpm package [x64|arm64|all]` builds
  `relicd-<v>-linux-<arch>.tar.gz`, each with only its own binaries and Node.
- No translations: the daemon's messages are in English; `language` only picks
  GOG's default language.
- `relicctl` commands no longer say "is it running?": they say "relicd stopped"
  and how to start it.
- The API drops the per-store channels (`login`, `authGOG`, `isLoggedIn`,
  `logoutLegendary`…): use `getStores`, `getAccounts`, `getLoginInfo`,
  `submitLogin` and `logout`.

#### Fixed

- **Zoom: an aborted download left a truncated installer** that the next attempt
  took for the finished one. It is now downloaded to a `.part` file and renamed
  only when complete.
- **`getLibrary` for Epic and Amazon** did not show an install or uninstall
  until the next refresh (their stores are only rewritten by a refresh); it now
  fills in the state each manager keeps.
- **Repairing a Linux native game** created a `.bat` it does not need (its
  shortcut points to `start.sh`); it is now skipped.
- **Reinstalling a game whose prefix was kept** failed with `EEXIST` when
  creating the prefix links and skipped the rest of the preparation. It now
  replaces the existing links.
- **Zoom: a Windows installer that failed was taken as installed**: the game was
  recorded and added to Steam without existing. The install now ends in error.
  Logging out of Zoom also empties the cached library.
- **GOG: installing with no language sent the text "undefined" to gogdl**, which
  crashed. It now defaults to `en-US` and stores the language used
  (`relicctl install --lang`).
- **Reinstalling a GOG or Zoom game (and Epic's third-party ones) repeated its
  record** in `installed.json`: three installs left three entries, and uninstalling
  removed only one, so the game still looked installed. There is now one entry per
  game, uninstalling removes them all and a refresh cleans up the duplicates that
  already exist. Also, removing a third-party game that was not in the list deleted
  the last one.
- **Epic ignored `installDlcs`** and always passed `--skip-dlcs`.
- **`checkGameUpdates` reported games the automatic update had already queued**,
  and Amazon with no session was logged as an error (it is the normal state).

#### Removed

- Electron, the React frontend, the preload, the main window, the tray,
  `images_cache`, Playwright, electron-vite, electron-builder and their
  dependencies; the window, shortcut, clipboard, gamepad and zoom channels.
- i18next and the translations (`public/locales`), `easydl`, `tmp`, `undici`
  (the proxy is handled by `NODE_USE_ENV_PROXY`), the e2e support inherited from
  Relic, the `@types/node` patch and unused code. `node_modules` goes from
  605 MB to 171 MB.
- The native Linux Comet (`getCometVersion`, `altCometBin`, the `comet` log);
  `comet.exe` stays, as it runs inside the prefix.
- Per-game settings (`GameConfig`, `GameSettings`), the Cyberpunk mods, GOG cloud
  saves and the UI-era channels.
- The Windows arm64 `.exe` files (nothing used them).
