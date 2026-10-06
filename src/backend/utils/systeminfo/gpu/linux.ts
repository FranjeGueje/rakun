import { hasExecutable } from '../../os/path'

import type { PartialGpuInfo } from './index'

/**
 * Lists the GPUs with `lspci`: display controllers are PCI class 03xx (VGA,
 * 3D and display). Without `lspci` there is nothing to ask, so no GPU is
 * reported.
 */
async function getGpuInfo_linux(): Promise<PartialGpuInfo[]> {
  if (!(await hasExecutable('lspci'))) return []

  const { genericSpawnWrapper } = await import('../../os/processes')
  const { stdout } = await genericSpawnWrapper('lspci', [
    '-mm', // machine-readable format
    '-k', // display kernel driver in use
    '-v', // be verbose (actually prints the kernel driver and PCI subsystem IDs)
    '-n' // only output numeric values (we'll get the names ourselves later)
  ])

  return parseLspciGpus(stdout)
}

/**
 * Sample entry of `lspci -mm -k -v -n`:
 *
 *   Slot:   04:00.0
 *   Class:  0300
 *   Vendor: 1002
 *   Device: 163f
 *   SVendor:        1002
 *   SDevice:        0123
 *   Driver: amdgpu
 */
function parseLspciGpus(output: string): PartialGpuInfo[] {
  const gpus: PartialGpuInfo[] = []

  for (const entry of output.split(/\n\s*\n/)) {
    const field = (name: string) =>
      new RegExp(`^${name}:\\t(\\S+)`, 'm').exec(entry)?.[1]

    const deviceClass = field('Class')
    const vendorId = field('Vendor')
    const deviceId = field('Device')
    if (!deviceClass?.startsWith('03') || !vendorId || !deviceId) continue

    gpus.push({
      deviceId,
      vendorId,
      subvendorId: field('SVendor'),
      subdeviceId: field('SDevice'),
      driverVersion: field('Driver')
    })
  }

  return gpus
}

export { getGpuInfo_linux, parseLspciGpus }
