import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  type Stats,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  copyFileSync
} from 'fs'
import { basename, join } from 'path'
import { logError, logInfo, logWarning } from 'backend/logger'
import {
  rakunMountPath,
  rakunInstallPath,
  userDataPath,
  publicDir
} from 'backend/constants/paths'
import {
  legendaryConfigPath,
  legendaryInstalled
} from 'backend/storeManagers/legendary/constants'
import {
  nileConfigPath,
  nileInstalled
} from 'backend/storeManagers/nile/constants'
import { gogdlConfigPath } from 'backend/storeManagers/gog/constants'
import { GameInfo } from 'common/types'
import type { GameRunner } from './steam_shortcuts/types'
import { createGameSymlink } from './steam_shortcuts/add_game'

const LOG_PREFIX = 'Rakun'

export const EOS_OVERLAY_BAT = 'eos-overlay.bat'

// ── Types and config ──

type StoreConfig = {
  configDir: string
  installedFile: string
  mountDir: string
  transform: (data: unknown) => unknown
}

const STORE_CONFIGS: Record<GameRunner, StoreConfig> = {
  legendary: {
    configDir: legendaryConfigPath,
    installedFile: legendaryInstalled,
    mountDir: 'legendary',
    transform: (data: unknown) => {
      const obj = data as Record<string, Record<string, unknown>>
      return Object.fromEntries(
        Object.entries(obj).map(([key, entry]) => [
          key,
          {
            ...entry,
            install_path: `c:\\games\\${basename(entry.install_path as string)}`
          }
        ])
      )
    }
  },
  gog: {
    configDir: join(userDataPath, 'gog_store'),
    installedFile: join(userDataPath, 'gog_store', 'installed.json'),
    mountDir: 'gog_store',
    transform: (data: unknown) => {
      const obj = data as Record<string, unknown>
      if (!obj.installed || !Array.isArray(obj.installed)) return data
      return {
        ...obj,
        installed: obj.installed.map((entry: Record<string, unknown>) => ({
          ...entry,
          install_path: `c:\\games\\${basename(entry.install_path as string)}`
        }))
      }
    }
  },
  nile: {
    configDir: nileConfigPath,
    installedFile: nileInstalled,
    mountDir: 'nile',
    transform: (data: unknown) => {
      if (!Array.isArray(data)) return data
      return data.map((entry: Record<string, unknown>) => ({
        ...entry,
        path: `c:\\games\\${basename(entry.path as string)}`
      }))
    }
  },
  zoom: { configDir: '', installedFile: '', mountDir: '', transform: (d) => d }
}

// ── Public API ──

export function windowify(gameInfo: GameInfo, installPath: string): void {
  ensureMountDirs()
  createGameSymlink(installPath)
  syncGogdlConfig()

  const config = STORE_CONFIGS[gameInfo.runner]
  if (!config || !config.installedFile) {
    logWarning(
      `windowify not implemented for runner: ${gameInfo.runner}`,
      LOG_PREFIX
    )
    return
  }

  const mountDir = join(rakunMountPath, config.mountDir)

  try {
    if (config.configDir) {
      symlinkStoreFiles(config.configDir, mountDir)
    }

    if (!existsSync(config.installedFile)) {
      logWarning(
        `No installed.json found at ${config.installedFile}`,
        LOG_PREFIX
      )
      return
    }

    const installedTarget = join(mountDir, 'installed.json')
    if (existsSync(installedTarget)) {
      unlinkSync(installedTarget)
    }

    copyAndTransformInstalled(
      config.installedFile,
      installedTarget,
      config.transform
    )
  } catch (error) {
    logError(`Failed to windowify: ${String(error)}`, LOG_PREFIX)
  }
}

export function createRakunSymlinks(linksPath: string): void {
  const rakunLink = join(linksPath, 'Launchers')
  const gamesLink = join(linksPath, 'games')

  try {
    if (existsSync(rakunLink)) unlinkSync(rakunLink)
    if (existsSync(gamesLink)) unlinkSync(gamesLink)

    symlinkSync(rakunMountPath, rakunLink)
    symlinkSync(rakunInstallPath, gamesLink)

    logInfo(`Created symlinks in ${linksPath}`, LOG_PREFIX)
  } catch (error) {
    logError(
      `Failed to create symlinks in ${linksPath}: ${String(error)}`,
      LOG_PREFIX
    )
    throw error
  }
}

export function syncMountBin(): void {
  const sourceDir = join(publicDir, 'bin', 'x64', 'win32')
  const targetDir = join(rakunMountPath, 'bin')

  if (!existsSync(sourceDir)) {
    logWarning(`syncMountBin: source not found: ${sourceDir}`, LOG_PREFIX)
    return
  }

  mkdirSync(targetDir, { recursive: true })

  const files = readdirSync(sourceDir)
  let copied = 0

  for (const file of files) {
    const sourcePath = join(sourceDir, file)
    const targetPath = join(targetDir, file)

    const source = statSync(sourcePath)
    if (!source.isFile() || isUpToDate(source, targetPath)) continue

    copyFileSync(sourcePath, targetPath)
    logInfo(`syncMountBin: ${file} copied`, LOG_PREFIX)
    copied++
  }

  logInfo(`syncMountBin: ${files.length} files, ${copied} copied`, LOG_PREFIX)
}

/**
 * Writes the EOS Overlay setup script into the mount root, so that inside any
 * prefix it is reachable as `c:\Launchers\eos-overlay.bat`. Run once per prefix
 * through umu-run, right after the prefix itself is created.
 */
export function createEosOverlayBat(): string {
  mkdirSync(join(rakunMountPath, 'eos'), { recursive: true })

  const batPath = join(rakunMountPath, EOS_OVERLAY_BAT)

  const content = [
    '@echo off',
    'title Rakun EOS Overlay',
    '',
    'echo Rakun EOS Overlay setup',
    'echo.',
    '',
    'rem ============================================================',
    'rem Configuration',
    'rem ============================================================',
    '',
    'set "LAUNCHERS=C:\\Launchers"',
    '',
    'set "LEGENDARY_CONFIG_PATH=%LAUNCHERS%\\Legendary"',
    'set "PATH=%PATH%;%LAUNCHERS%\\bin"',
    '',
    'rem ============================================================',
    'rem PRECHECKS',
    'rem ============================================================',
    '',
    'if not exist "%LAUNCHERS%\\bin\\legendary.exe" (',
    '    echo [ERROR]: legendary.exe not found.',
    '    timeout /t 2 /nobreak >nul',
    '    exit /b 1',
    ')',
    '',
    'rem ============================================================',
    'rem EOS OVERLAY',
    'rem ============================================================',
    '',
    'rem install: downloads the overlay and, from inside the prefix, also',
    'rem writes its registry entries',
    'legendary -y eos-overlay install --path %LAUNCHERS%\\eos',
    '',
    'rem update: keeps the overlay current once it is already installed',
    'legendary -y eos-overlay update --path %LAUNCHERS%\\eos',
    '',
    'rem enable: required on every new prefix. install/update bail out early',
    'rem with "up to date, nothing to do" because that state lives in the',
    'rem shared LEGENDARY_CONFIG_PATH, so they never reach the registry setup',
    'rem for THIS prefix. enable writes it explicitly and is idempotent.',
    'legendary eos-overlay enable --path %LAUNCHERS%\\eos',
    '',
    'exit /b 0'
  ].join('\n')

  writeFileSync(batPath, content, 'utf-8')
  logInfo(`Created ${batPath}`, LOG_PREFIX)

  return batPath
}

// ── Private helpers ──

function ensureMountDirs(): void {
  for (const config of Object.values(STORE_CONFIGS)) {
    if (config.mountDir) {
      mkdirSync(join(rakunMountPath, config.mountDir), { recursive: true })
    }
  }
  mkdirSync(join(rakunMountPath, 'gogdl'), { recursive: true })
  mkdirSync(join(rakunMountPath, 'heroic_gogdl'), { recursive: true })
}

function syncGogdlConfig(): void {
  if (!existsSync(gogdlConfigPath)) return
  for (const target of ['gogdl', 'heroic_gogdl']) {
    const mountDir = join(rakunMountPath, target)
    symlinkStoreFiles(gogdlConfigPath, mountDir)
  }
}

function symlinkStoreFiles(sourceDir: string, mountDir: string): void {
  if (!existsSync(sourceDir)) {
    logWarning(`Source directory not found: ${sourceDir}`, LOG_PREFIX)
    return
  }
  mkdirSync(mountDir, { recursive: true })

  const entries = readdirSync(sourceDir)
  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry)
    const mountPath = join(mountDir, entry)

    if (existsSync(mountPath)) {
      rmSync(mountPath, { recursive: true })
    }

    symlinkSync(sourcePath, mountPath)
  }
  logInfo(
    `Symlinked ${entries.length} entries from ${sourceDir} → ${mountDir}`,
    LOG_PREFIX
  )
}

function copyAndTransformInstalled(
  sourcePath: string,
  targetPath: string,
  transform: (data: unknown) => unknown
): void {
  const content = readFileSync(sourcePath, 'utf-8')
  const data = JSON.parse(content)
  const transformed = transform(data)
  writeFileSync(targetPath, JSON.stringify(transformed, null, 2), 'utf-8')
  logInfo(`Windowified ${sourcePath} → ${targetPath}`, LOG_PREFIX)
}

/**
 * The copy is good when it has the same size and is not older than the source.
 * The files are tens of MB and this runs on every start: reading them all to
 * compare hashes costs more than starting everything else.
 */
function isUpToDate(source: Stats, targetPath: string): boolean {
  if (!existsSync(targetPath)) return false
  const target = statSync(targetPath)
  return target.size === source.size && target.mtimeMs >= source.mtimeMs
}
