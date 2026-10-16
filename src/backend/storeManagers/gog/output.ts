import type { GOGDLInstallInfo } from 'common/types/gog'

/** The parts of `gogdl info` that rakun reads without asking: if one is missing the output is not the one it knows */
export const isGogInfo = (value: unknown): value is GOGDLInstallInfo => {
  const info = value as Partial<GOGDLInstallInfo> | null
  return (
    typeof info?.folder_name === 'string' &&
    Array.isArray(info.languages) &&
    info.languages.every((language) => typeof language === 'string') &&
    typeof info.size === 'object' &&
    info.size !== null &&
    Array.isArray(info.dlcs)
  )
}
