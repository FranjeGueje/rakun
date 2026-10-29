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

const WRITER_FAILED = 'Task writer failed'

/**
 * gogdl stops when it cannot write a file («Task writer failed», on stderr)
 * and still ends with code 0, without saving the new manifest. Only the end
 * of stderr is kept, so the output is watched while it comes
 */
export function writerFailureWatcher() {
  let previous = ''
  let failed = false
  return {
    watch: (data: string) => {
      failed ||= (previous + data).includes(WRITER_FAILED)
      previous = data.slice(-WRITER_FAILED.length)
    },
    failure: () =>
      failed
        ? `gogdl could not write some files («${WRITER_FAILED}»): see the game's log`
        : undefined
  }
}
