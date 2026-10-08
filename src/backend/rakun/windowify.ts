import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { basename, join } from 'path'
import { logError, logInfo, logWarning } from 'backend/logger'
import {
  rakunMountPath,
  rakunInstallPath,
  userDataPath
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
import { SCRIPTS_DIR } from './runner_script'
import { eosOverlayScriptText } from './eos_overlay_script'

const LOG_PREFIX = 'Rakun'

/** Inside the scripts folder of the mount, next to the runner */
export const EOS_OVERLAY_BAT = join(SCRIPTS_DIR, 'eos-overlay.bat')

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

/**
 * Writes the EOS Overlay setup script into the scripts folder of the mount, so
 * that inside any prefix it is reachable as `c:\Launchers\scripts\eos-overlay.bat`. Run once per prefix
 * through umu-run, right after the prefix itself is created.
 */
export function createEosOverlayBat(): string {
  mkdirSync(join(rakunMountPath, 'eos'), { recursive: true })
  mkdirSync(join(rakunMountPath, SCRIPTS_DIR), { recursive: true })
  // Before the scripts folder it sat in the root of the mount
  rmSync(join(rakunMountPath, 'eos-overlay.bat'), { force: true })

  const batPath = join(rakunMountPath, EOS_OVERLAY_BAT)

  const content = eosOverlayScriptText()

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
