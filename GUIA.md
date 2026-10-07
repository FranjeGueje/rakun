# Guía de pruebas de relicd

Todo se prueba con `relicctl`, `curl` y `scripts/smoke.sh`. Las secciones usan
`smoke.sh` porque enseña el canal y los argumentos exactos; `relicctl` hace lo
mismo con comandos (ver la tabla siguiente). Desde la raíz del repositorio.
El script lee el puerto y el token de `~/.config/relicd/api.json`. El contrato
completo está en [API.md](API.md).

## Arrancar y parar

relicd no instala ningún servicio: lo arrancas tú cuando lo necesites.

```bash
scripts/install.sh dist/relicd-0.1.0-linux-x64.tar.gz   # instala en ~/.local/opt/relicd

relicd                                                  # en primer plano, Ctrl+C lo para
systemd-run --user --unit=relicd ~/.local/opt/relicd/relicd   # en segundo plano, transitorio
systemctl --user stop relicd                            # para el de segundo plano
```

Para reinstalar una versión nueva: `pnpm package`, volver a ejecutar
`scripts/install.sh …` y reiniciar relicd. Los logins se conservan (viven en
`~/.config/relicd`).

Para probar sin tocar tu `$HOME` real:

```bash
HOME=$(mktemp -d) RELICD_PORT=17999 relicd
HOME=<ese mismo directorio> RELICD_API_FILE=<ese>/.config/relicd/api.json scripts/smoke.sh
```

## relicctl

Con relicd instalado, `relicctl` (o `node build/relicctl.cjs` desde el
repositorio) evita escribir el JSON a mano. Usa el mismo `api.json` y la misma
variable `RELICD_API_FILE`.

| Quieres…                    | `relicctl`                                      |
| --------------------------- | ----------------------------------------------- |
| ver si está vivo y sesiones | `relicctl status`                               |
| iniciar sesión              | `relicctl login gog` (epic, gog, amazon, zoom)  |
| traer las sesiones de Relic | `relicctl import-relic`                         |
| listar la biblioteca        | `relicctl library [tienda] [--installed]`       |
| refrescarla y esperar       | `relicctl refresh [tienda]`                     |
| instalar                    | `relicctl install gog <appName> [--path DIR]`   |
| actualizar o reparar        | `relicctl update` / `repair <tienda> <appName>` |
| desinstalar                 | `relicctl uninstall <tienda> <appName>`         |
| ver la cola                 | `relicctl queue`                                |
| seguir los eventos          | `relicctl events`                               |
| cualquier otro canal        | `relicctl call <canal> '[args]'`                |

`install`, `update`, `repair` y `uninstall` esperan a que acabe y devuelven un
código distinto de 0 si falla (`--no-wait` para no esperar). `--json` da la
salida para scripts. `uninstall` borra los ficheros del juego y su
configuración.

## Formato de los argumentos

Los argumentos van como **JSON**: las cadenas llevan comillas dobles dentro del
array, y todo el array entre comillas simples.

```bash
scripts/smoke.sh getLoginInfo '["gog"]'     # bien
scripts/smoke.sh getLoginInfo '[gog]'       # mal: HTTP 400 (JSON inválido)
```

Sin argumentos se omite el segundo parámetro: `scripts/smoke.sh getAccounts`.

## 1. ¿Está vivo?

```bash
scripts/smoke.sh
```

Debe mostrar la versión, la cola en `idle`, la biblioteca (`[]` si aún no hay
sesión) y un `403` al final (canal no expuesto). Si dice que no encuentra
`api.json`, relicd no está arrancado con tu `HOME`.

## 2. Iniciar sesión en cada tienda

Pide la URL de login y ábrela en el navegador:

```bash
scripts/smoke.sh getLoginInfo '["gog"]'     # también: legendary, nile, zoom (ver getStores)
```

Inicia sesión y pega lo que el navegador deja al terminar:

```bash
scripts/smoke.sh submitLogin '["gog","https://embed.gog.com/on_login_success?...&code=XXXX"]'
```

Debe responder `{"result":{"ok":true}}`.

| Tienda             | Qué pegar                                                     |
| ------------------ | ------------------------------------------------------------- |
| `legendary` (Epic) | el JSON que muestra la página (o solo el `authorizationCode`) |
| `gog`              | la dirección final, aunque la página se vea en blanco         |
| `nile` (Amazon)    | la dirección final; llama antes a `getLoginInfo '["nile"]'`   |
| `zoom`             | la dirección final con `li_token`, o el token suelto          |

Comprobar la sesión:

```bash
scripts/smoke.sh getAccounts                # quién ha iniciado sesión en cada tienda
scripts/smoke.sh getStores                  # las tiendas que soporta relicd
```

Para cerrar la sesión de una tienda: `scripts/smoke.sh logout '["gog"]'`.

Si falla:

- `"No login code found in what was pasted"`: la dirección no trae `code=`.
  Prueba a pegar solo el valor del código.
- `"The store rejected the login"`: el código ya se usó o caducó (valen pocos
  minutos y una sola vez). Repite con uno nuevo.
- Otro error: mira `~/.local/state/Relicd/logs/relicd.log`.

## 3. Biblioteca

Tras el login, esa tienda se refresca sola. Para pedirla:

```bash
scripts/smoke.sh getLibrary '["gog"]' | python3 -m json.tool | head -40
```

Para forzar un refresco:

```bash
scripts/smoke.sh refreshLibrary '["gog"]'   # vuelve al instante
scripts/smoke.sh getRefreshingLibraries     # ["gog"] mientras trabaja
scripts/smoke.sh --events                   # en otra terminal: llega "refreshLibrary" al acabar
```

`refreshLibrary` no espera a que termine (GOG puede tardar más de un minuto con
cientos de juegos) y un refresco ya en marcha de esa tienda se une, no se
repite. Cuando llega el evento, vuelve a llamar a `getLibrary`.

Apunta el `app_name` y el `runner` de un juego pequeño para el paso siguiente.

## 4. Instalar un juego

`install` pide el `gameInfo` completo; lo más cómodo es sacarlo de `getGameInfo`:

```bash
APP=1584866499; RUNNER=gog     # ejemplo: Beat Cop (GOG, nativo de Linux)
INFO=$(scripts/smoke.sh getGameInfo "[\"$APP\",\"$RUNNER\"]" | python3 -c "import sys,json;print(json.dumps(json.load(sys.stdin)['result']))")
scripts/smoke.sh install "[{\"appName\":\"$APP\",\"runner\":\"$RUNNER\",\"path\":\"$HOME/Games/Relicd\",\"platformToInstall\":\"linux\",\"installLanguage\":\"en-US\",\"gameInfo\":$INFO}]"
```

Para un juego de Windows, `"platformToInstall":"Windows"`.

## 5. Seguir el progreso

En otra terminal:

```bash
scripts/smoke.sh --events                   # progressUpdate, gameStatusUpdate, ...
scripts/smoke.sh getDMQueueInformation      # estado de la cola
```

Al terminar, el juego debe aparecer en Steam con su nombre y en el log debe
salir `Saved shortcut`.

## Portadas de Steam (SteamGridDB)

Sin clave de SteamGridDB relicd no descarga las imágenes al añadir un juego a
Steam (la clave es de relicd, no se hereda de Relic).

```bash
scripts/smoke.sh steamgriddb.hasApiKey                  # {"result":false} si falta
scripts/smoke.sh steamgriddb.setApiKey '["TU_CLAVE"]'
```

Un juego instalado antes de poner la clave hay que reinstalarlo para que las
baje.

## 6. Desinstalar, reparar y otras acciones

```bash
scripts/smoke.sh uninstall "[\"$APP\",\"$RUNNER\",false,false]"
scripts/smoke.sh repair "[\"$APP\",\"$RUNNER\"]"
scripts/smoke.sh kill "[\"$APP\",\"$RUNNER\"]"            # aborta lo que esté haciendo
scripts/smoke.sh pauseCurrentDownload
scripts/smoke.sh resumeCurrentDownload
```

Un shortcut añadido a Steam **no se borra** al desinstalar: se quita a mano
desde la biblioteca de Steam.

## Dónde mirar si algo falla

| Qué                      | Dónde                                                         |
| ------------------------ | ------------------------------------------------------------- |
| Log general              | `~/.local/state/Relicd/logs/relicd.log`                       |
| Log de una tienda        | `~/.local/state/Relicd/logs/runners/<tienda>.log`             |
| Log de una instalación   | `~/.local/state/Relicd/logs/games/<app>_<runner>/install.log` |
| Proceso en segundo plano | `journalctl --user -u relicd -f`                              |
| Puerto y token           | `~/.config/relicd/api.json` (`RELICD_PORT` cambia el puerto)  |
