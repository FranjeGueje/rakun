/**
 * @file Figures out system information (CPU, GPU, memory) and software versions (Rakun, Legendary, gogdl, etc.)
 */

import os from 'os'
import process from 'process'
import { formatBytes } from 'common/formatBytes'

import { getGpuInfo } from './gpu'
import { getMemoryInfo } from './memory'
import { getOsInfo } from './osInfo'
import { getSteamDeckInfo, type SteamDeckInfo } from './steamDeck'
import { getRakunVersion } from './rakunVersion'
import {
  getGogdlVersion,
  getLegendaryVersion,
  getNileVersion
} from '../helperBinaries'

type GPUInfo = {
  // The PCI device ID of the graphics card (hexadecimal)
  deviceId: string
  // The PCI vendor ID of the graphics card (hexadecimal)
  vendorId: string
  // The PCI sub-device ID of the graphics card (hexadecimal)
  subdeviceId?: string
  // The PCI sub-vendor ID of the graphics card (hexadecimal)
  subvendorId?: string
  // If the device has an entry in `pci.ids`, this is its name
  deviceString?: string
  // If the vendor has an entry in `pci.ids`, this is their name
  vendorString?: string
  // On Windows: The version of the GPU driver (formatted as nicely as possible)
  // On Linux:   The driver in use (nvidia/nouveau; amdgpu/radeon/etc.)
  driverVersion?: string
}

interface SystemInformation {
  CPU: {
    model: string
    cores: number
  }
  memory: {
    used: number
    total: number
    usedFormatted: string
    totalFormatted: string
  }
  GPUs: GPUInfo[]
  OS: {
    platform: string
    name: string
    version: string
  }
  steamDeckInfo: SteamDeckInfo
  softwareInUse: {
    rakunVersion: string
    legendaryVersion: string
    gogdlVersion: string
    nileVersion: string
  }
}

let cachedSystemInfo: SystemInformation | null = null

/**
 * Gathers information about various system components
 * @param cache Whether cached information should be returned if possible
 */
async function getSystemInfo(cache = true): Promise<SystemInformation> {
  if (cache && cachedSystemInfo) return cachedSystemInfo

  const cpus = os.cpus()
  const memory = await getMemoryInfo()
  const gpus = await getGpuInfo()
  const detailedOsInfo = await getOsInfo()
  const deckInfo = getSteamDeckInfo(cpus, gpus)
  const [legendaryVersion, gogdlVersion, nileVersion] = await Promise.all([
    getLegendaryVersion(),
    getGogdlVersion(),
    getNileVersion()
  ])

  const sysinfo: SystemInformation = {
    CPU: {
      model: cpus[0].model,
      // FIXME: Technically the user could be on a server with more than one
      //        physical CPU installed, but I'd say that's rather unlikely
      cores: cpus.length
    },
    memory: {
      total: memory.total,
      used: memory.used,
      totalFormatted: formatBytes(memory.total),
      usedFormatted: formatBytes(memory.used)
    },
    GPUs: gpus,
    OS: {
      platform: process.platform,
      version: os.release(),
      ...detailedOsInfo
    },
    steamDeckInfo: deckInfo,
    softwareInUse: {
      rakunVersion: getRakunVersion(),
      legendaryVersion: legendaryVersion,
      gogdlVersion: gogdlVersion,
      nileVersion: nileVersion
    }
  }
  cachedSystemInfo = sysinfo
  return sysinfo
}

/** What the log says about the system, one entry per line so that each one carries the log prefix */
function systemInfoLines(info: SystemInformation): string[] {
  const { steamDeckInfo: deck, softwareInUse: software } = info
  return [
    `CPU: ${info.CPU.cores}x ${info.CPU.model}`,
    `Memory: ${formatBytes(info.memory.total)} (used: ${formatBytes(info.memory.used)})`,
    'GPUs:',
    ...info.GPUs.flatMap((gpu, index) => [
      `  GPU ${index}:`,
      `    Name: ${gpu.vendorString} ${gpu.deviceString}`,
      `    IDs: D=${gpu.deviceId} V=${gpu.vendorId} SD=${gpu.subdeviceId} SV=${gpu.subvendorId}`,
      `    Driver: ${gpu.driverVersion}`
    ]),
    `OS: ${info.OS.name} ${info.OS.version} (${info.OS.platform})`,
    ...(deck.isDeck
      ? [
          `The current system is a Steam Deck (model: ${deck.model}) in ${deck.mode} mode`
        ]
      : []),
    'Software Versions:',
    `  Rakun: ${software.rakunVersion}`,
    `  Legendary: ${software.legendaryVersion}`,
    `  gogdl: ${software.gogdlVersion}`,
    `  Nile: ${software.nileVersion}`
  ]
}

export { getSystemInfo, systemInfoLines }
export type { SystemInformation, GPUInfo }
