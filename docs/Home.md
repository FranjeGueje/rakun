# rakun wiki

rakun is a headless Linux service that logs in to Epic Games, GOG, Amazon Games and Zoom Platform, installs your games and adds them to Steam. These pages hold the details the [README](../README.md) leaves out.

## Using rakun

| Page                                  | What is in it                                                      |
| ------------------------------------- | ------------------------------------------------------------------ |
| [Getting started](Getting-Started.md) | Install, start, download the helpers, log in, install a first game |
| [User guide](User-Guide.md)           | Day-to-day tasks: library, install, update, repair, the web        |
| [Commands](Commands.md)               | Every `rakunctl` command and option                                |
| [Configuration](Configuration.md)     | Settings, web access, port, environment variables                  |
| [Helper binaries](Helper-Binaries.md) | The programs rakun runs for each store and how they are installed  |
| [Troubleshooting](Troubleshooting.md) | Symptoms and what to do                                            |
| [File locations](File-Locations.md)   | Where rakun keeps its files                                        |

## How it works

| Page                                      | What is in it                                           |
| ----------------------------------------- | ------------------------------------------------------- |
| [Steam integration](Steam-Integration.md) | What happens after an install: runner, prefix, shortcut |
| [Architecture](Architecture.md)           | Layers, source layout, how to add a store               |
| [API](../API.md)                          | The HTTP contract: channels, login flow, events         |

## Contributing

| Page                          | What is in it                                  |
| ----------------------------- | ---------------------------------------------- |
| [Development](Development.md) | Build, test, lint and package                  |
| [Testing](Testing.md)         | Step-by-step manual test walkthrough with curl |
