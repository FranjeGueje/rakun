import type { InstallProgress } from 'common/types'

/** What butler says of an operation in a `Progress` notification (`progress` goes from 0 to 1) */
export type ButlerProgress = { progress?: number; eta?: number; bps?: number }

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0')

/** Seconds as `HH:MM:SS`, the way the other stores report it */
export function formatEta(seconds: number): string {
  return `${pad(seconds / 3600)}:${pad((seconds % 3600) / 60)}:${pad(seconds % 60)}`
}

export function toInstallProgress({
  progress = 0,
  eta = 0,
  bps = 0
}: ButlerProgress): InstallProgress {
  return {
    bytes: '',
    eta: formatEta(eta),
    percent: Math.round(progress * 1000) / 10,
    downSpeed: bps / (1024 * 1024),
    diskSpeed: 0
  }
}
