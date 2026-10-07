# rakun

[English](README.md)

rakun es un fork **solo backend** de Relic (que viene de Heroic Games Launcher: Heroic → Relic → rakun; el historial de git de los tres se conserva y las personas que contribuyeron están en [AUTHORS](AUTHORS)): un servicio Node sin Electron ni ventana. Una
API HTTP local permite a un cliente (la web de rakun, `rakunctl` o el módulo `invasor-relic` de Invasor) iniciar sesión en las
tiendas, ver la biblioteca e instalar, actualizar, reparar y desinstalar juegos. No lanza
juegos: al terminar cada instalación hace la integración con Steam y el juego aparece en
Steam. `relicd-client`, la app de Electron que fue el primer cliente, está **archivada y sin mantenimiento**: la
reemplaza la web de rakun. No comparte nada con Relic (rutas `rakun`, no `relic`). `rakunctl` es el
cliente de línea de comandos (ver la sección _rakunctl_; la guía de pruebas está en
[GUIDE.md](GUIDE.md), en inglés).

El resto de la documentación (instalación, API, solución de problemas) está en inglés en [README.md](README.md).
