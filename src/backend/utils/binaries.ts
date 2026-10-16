import { basename, dirname, join } from 'path'
import { GlobalConfig } from 'backend/config'
import { helperExists, helperFile } from 'backend/rakun/helpers/locations'

export function splitPathAndName(fullPath: string): {
  dir: string
  bin: string
} {
  const dir = dirname(fullPath)
  const bin = basename(fullPath)
  // Make sure to always return this as `dir, bin` to not break path
  // resolution when using `join(...Object.values(...))`
  return { dir, bin }
}

export function archSpecificBinary(binaryName: string) {
  // Try to use the arch-native binary first, if that doesn't exist fall back to
  // the x64 version (assume a compatibility layer like box64 is installed)
  const archSpecific = join(process.arch, process.platform, binaryName)
  if (helperExists(archSpecific)) return helperFile(archSpecific)
  return helperFile(join('x64', process.platform, binaryName))
}

let defaultLegendaryPath: string | undefined = undefined
export function getLegendaryBin(): { dir: string; bin: string } {
  const settings = GlobalConfig.get().getSettings()
  if (settings?.altLegendaryBin) {
    return splitPathAndName(settings.altLegendaryBin)
  }

  if (!defaultLegendaryPath)
    defaultLegendaryPath = archSpecificBinary('legendary')

  return splitPathAndName(defaultLegendaryPath)
}

let defaultGogdlPath: string | undefined = undefined
export function getGOGdlBin(): { dir: string; bin: string } {
  const settings = GlobalConfig.get().getSettings()
  if (settings?.altGogdlBin) {
    return splitPathAndName(settings.altGogdlBin)
  }

  if (!defaultGogdlPath) defaultGogdlPath = archSpecificBinary('gogdl')

  return splitPathAndName(defaultGogdlPath)
}

let defaultNilePath: string | undefined = undefined
export function getNileBin(): { dir: string; bin: string } {
  const settings = GlobalConfig.get().getSettings()
  if (settings?.altNileBin) {
    return splitPathAndName(settings.altNileBin)
  }

  if (!defaultNilePath) defaultNilePath = archSpecificBinary('nile')

  return splitPathAndName(defaultNilePath)
}
