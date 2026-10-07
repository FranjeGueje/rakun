# Guía de pruebas de rakun

Todo se prueba con `rakunctl`, `curl` y `scripts/smoke.sh`. Las secciones usan
`smoke.sh` porque enseña el canal y los argumentos exactos; `rakunctl` hace lo
mismo con comandos (ver la tabla siguiente). Desde la raíz del repositorio.
El script lee el puerto y el token de `~/.config/rakun/api.json`. El contrato
completo está en [API.md](API.md).

## Arrancar y parar

rakun no instala ningún servicio: lo arrancas tú cuando lo necesites.

```bash
scripts/install.sh                                      # instala en ~/.local/opt/rakun el tarball de tu arquitectura de dist/

rakun                                                  # en primer plano, Ctrl+C lo para
systemd-run --user --unit=rakun ~/.local/opt/rakun/rakun   # en segundo plano, transitorio
rakunctl start | stop                                         # alternativa sin systemd
rakunctl -s library                                           # arranca si hace falta y para al acabar
systemctl --user stop rakun                            # para el de segundo plano
rakunctl install-service | uninstall-service           # servicio de usuario: arranca al iniciar sesión (Zoom no: sin pantalla)
```

Para reinstalar una versión nueva: `pnpm package`, volver a ejecutar
`scripts/install.sh …` y reiniciar rakun. Los logins se conservan (viven en
`~/.config/rakun`).

Para probar sin tocar tu `$HOME` real (**con un directorio que exista y no esté vacío**: con `HOME=`
vacío rakun crea sus carpetas en el directorio actual):

```bash
HOME=$(mktemp -d) RAKUN_PORT=17999 rakun
HOME=<ese mismo directorio> RAKUN_API_FILE=<ese>/.config/rakun/api.json scripts/smoke.sh
```

## rakunctl

Con rakun instalado, `rakunctl` (o `node build/rakunctl.cjs` desde el
repositorio) evita escribir el JSON a mano. Usa el mismo `api.json` y la misma
variable `RAKUN_API_FILE`.

| Quieres…                     | `rakunctl`                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| arrancar / parar rakun       | `rakunctl start` / `rakunctl stop [--force]`                                                                                  |
| elegir web y puerto          | `rakunctl start --web local\|network\|off --port N` (o `config webAccess`)                                                    |
| ver si está vivo y sesiones  | `rakunctl status` (dice «rakun parado» si no lo está)                                                                         |
| iniciar sesión               | `rakunctl login gog` (epic, gog, amazon, zoom)                                                                                |
| traer las sesiones de Relic  | `rakunctl import-relic`                                                                                                       |
| listar la biblioteca         | `rakunctl library [tienda] [--installed]`                                                                                     |
| refrescarla y esperar        | `rakunctl refresh [tienda]`                                                                                                   |
| instalar                     | `rakunctl install gog <appName> [--path DIR] [--lang CODE] [--skip-dlcs]`                                                     |
| actualizar                   | `rakunctl update [tienda [appName]]`: un juego, los de una tienda o todos los que tengan versión nueva (Zoom no se actualiza) |
| reparar                      | `rakunctl repair <tienda> <appName>`                                                                                          |
| desinstalar                  | `rakunctl uninstall <tienda> <appName>`                                                                                       |
| ver la cola                  | `rakunctl queue`                                                                                                              |
| pausar / reanudar / cancelar | `rakunctl pause` / `resume` / `cancel [--remove-files]`                                                                       |
| vaciar la lista de acabadas  | `rakunctl queue clear`                                                                                                        |
| ver o cambiar ajustes        | `rakunctl config [clave [valor]]` (p. ej. `config protonPath RUTA`)                                                           |
| leer los registros           | `rakunctl logs [tienda [appName]] [--type install]`                                                                           |
| vaciar la caché              | `rakunctl cache clear [tienda]`                                                                                               |
| borrar sesiones y ajustes    | `rakunctl reset [--yes]` (detiene rakun; los juegos no se tocan)                                                              |
| seguir los eventos           | `rakunctl events`                                                                                                             |
| cualquier otro canal         | `rakunctl call <canal> '[args]'`                                                                                              |

`install`, `update`, `repair` y `uninstall` esperan a que acabe y devuelven un
código distinto de 0 si falla (`--no-wait` para no esperar). `--json` da la
salida para scripts. `-s` delante de cualquier comando que termine (no vale con
`events` ni con `--no-wait`) arranca rakun si estaba parado y lo para al
acabar; si ya estaba arrancado, no lo toca. `install` de un juego ya instalado se rechaza («ya está instalado: usa repair o update»). `uninstall` borra los ficheros del juego. `--lang` elige el
idioma de la instalación (en GOG, `en-US` si no se indica). Por defecto se
instalan los DLC; `--skip-dlcs` los omite.

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
`api.json`, rakun no está arrancado con tu `HOME`.

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
scripts/smoke.sh getStores                  # las tiendas que soporta rakun
```

Para cerrar la sesión de una tienda: `scripts/smoke.sh logout '["gog"]'`.

Si falla:

- `"No login code found in what was pasted"`: la dirección no trae `code=`.
  Prueba a pegar solo el valor del código.
- `"The store rejected the login"`: el código ya se usó o caducó (valen pocos
  minutos y una sola vez). Repite con uno nuevo.
- Otro error: mira `~/.local/state/Rakun/logs/rakun.log`.

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
scripts/smoke.sh install "[{\"appName\":\"$APP\",\"runner\":\"$RUNNER\",\"path\":\"$HOME/Games/Rakun\",\"platformToInstall\":\"linux\",\"installLanguage\":\"en-US\",\"gameInfo\":$INFO}]"
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

Sin clave de SteamGridDB rakun no descarga las imágenes al añadir un juego a
Steam (la clave es de rakun, no se hereda de Relic).

```bash
scripts/smoke.sh steamgriddb.hasApiKey                  # {"result":false} si falta
scripts/smoke.sh steamgriddb.setApiKey '["TU_CLAVE"]'
```

Un juego instalado antes de poner la clave hay que reinstalarlo para que las
baje.

## 6. Desinstalar, reparar y otras acciones

```bash
scripts/smoke.sh uninstall "[\"$APP\",\"$RUNNER\",false]"   # true borra también la carpeta del juego
scripts/smoke.sh repair "[\"$APP\",\"$RUNNER\"]"
scripts/smoke.sh kill "[\"$APP\",\"$RUNNER\"]"            # aborta lo que esté haciendo
scripts/smoke.sh pauseCurrentDownload
scripts/smoke.sh resumeCurrentDownload
```

Zoom (experimental): los juegos de **Windows** abren el asistente del instalador en
una ventana, así que rakun tiene que arrancarse con pantalla (modo escritorio) y con
`protonPath` configurado; sin ellas la instalación termina con error. rakun lo comprueba
**antes de descargar** (sin `DISPLAY`, con el servidor gráfico caído o en modo juego falla
al instante y `rakunctl install` dice el motivo); es una comprobación de mejor esfuerzo:
tras cambiar entre escritorio y modo juego, reinicia rakun. Los de Linux no necesitan
pantalla.

Un shortcut añadido a Steam **no se borra** al desinstalar: se quita a mano
desde la biblioteca de Steam.

## La web y sus modos

rakun sirve su propia web en el puerto de la API (`http://127.0.0.1:17370`). Quién puede abrirla:

| Modo                  | Cómo                                                   | Qué pasa                                                                     |
| --------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `local` (por defecto) | nada                                                   | solo este equipo                                                             |
| `network`             | `rakunctl start --web network` o `rakun --web=network` | toda la red, **sin protección** (aviso en el log, en `rakunctl` y en la web) |
| `off`                 | `--web off`                                            | no se sirve la página; la API sigue en este equipo                           |

El parámetro manda sobre la variable `RAKUN_WEB` y esta sobre el ajuste guardado
(`rakunctl config webAccess network`, que se aplica **al reiniciar** rakun). `--port N` /
`RAKUN_PORT` cambian el puerto.

```bash
H=$(mktemp -d -p ~/.cache); [ -n "$H" ] || exit 1          # un HOME temporal que NO esté vacío
env HOME=$H node build/rakunctl.cjs start --web network --port 17998
LAN=$(ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1 | head -1)
T=$(python3 -c "import json;print(json.load(open('$H/.config/rakun/api.json'))['token'])")

curl -s http://$LAN:17998/health                           # {"status":"ok",…,"web":"network"}
curl -s http://$LAN:17998/ | grep -o 'rakun-web" content="[a-z]*'      # network
curl -s -H "Host: evil.example:17998" http://$LAN:17998/health           # 403: Host no permitido
for c in setSetting listFolders getLogContent; do                         # 403 desde la red
  curl -s -X POST -H "x-rakun-token: $T" -d '{"args":[]}' http://$LAN:17998/api/$c; echo
done
curl -s -X POST -H "x-rakun-token: $T" -d '{"args":["/usr"]}' http://127.0.0.1:17998/api/listFolders   # 200 desde aquí
env HOME=$H node build/rakunctl.cjs stop; rm -rf "$H"
```

Entrar por la IP de la red desde el propio equipo cuenta como «red» (el socket no es de
loopback): sirve para probar el bloqueo sin otro dispositivo. Un puerto ocupado hace que
`rakunctl start` falle y diga el fichero de log (`~/.local/state/Rakun/logs/rakun.log`).

## Dónde mirar si algo falla

| Qué                      | Dónde                                                              |
| ------------------------ | ------------------------------------------------------------------ |
| Log general              | `~/.local/state/Rakun/logs/rakun.log` (también por qué no arrancó) |
| Log de una tienda        | `~/.local/state/Rakun/logs/runners/<tienda>.log`                   |
| Log de una instalación   | `~/.local/state/Rakun/logs/games/<app>_<runner>/install.log`       |
| Proceso en segundo plano | `journalctl --user -u rakun -f` (con `systemd-run`)                |
| Cualquier registro       | `rakunctl logs [tienda [appName]] [--type install]`                |
| Puerto y token           | `~/.config/rakun/api.json` (`RAKUN_PORT` cambia el puerto)         |
