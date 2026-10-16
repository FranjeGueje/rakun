import { logInfo, logError } from 'backend/logger'
import type { Runner } from 'common/types'

const LOG_PREFIX = 'UMU'

// A Record over every runner: a new store has to say its label here (or the compiler asks)
const umuStoreMap: Record<Runner, string> = {
  legendary: 'egs',
  gog: 'gog',
  nile: 'amazon',
  zoom: 'zoom',
  itch: 'itchio'
}

export function getUmuStoreLabel(runner: string): string | undefined {
  return umuStoreMap[runner as Runner]
}

export async function searchUmuGameId(
  store: string,
  appName: string
): Promise<string | null> {
  try {
    const url = `https://umu.openwinecomponents.org/umu_api.php?store=${store}&codename=${appName}`
    const response = await fetch(url)
    if (!response.ok) return null

    const data = (await response.json()) as { umu_id?: number | string }[]
    if (!Array.isArray(data) || data.length === 0) return null

    const umuId = data[0]?.umu_id
    if (umuId !== undefined && umuId !== null) {
      logInfo(`UMU game found: ${appName} → GAMEID=${umuId}`, LOG_PREFIX)
      return String(umuId)
    }
    return null
  } catch (error) {
    logError(
      `UMU database lookup failed for ${appName}: ${String(error)}`,
      LOG_PREFIX
    )
    return null
  }
}
