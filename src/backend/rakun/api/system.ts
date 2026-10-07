import type { DiskSpaceData } from 'common/types'
import { addHandler } from 'backend/ipc'
import { isEpicServiceOffline, getFileSize } from 'backend/utils'
import { getDiskInfo, isWritable } from 'backend/utils/filesystem'
import { Path } from 'backend/schemas'
import { rakunVersion } from 'backend/constants/others'

addHandler('checkDiskSpace', async (_e, folder): Promise<DiskSpaceData> => {
  // FIXME: Propagate errors

  const parsedPath = Path.parse(folder)

  const { freeSpace, totalSpace } = await getDiskInfo(parsedPath)
  const pathIsWritable = await isWritable(parsedPath)

  return {
    free: freeSpace,
    diskSize: totalSpace,
    validPath: pathIsWritable,
    message: `${getFileSize(freeSpace)} / ${getFileSize(totalSpace)}`
  }
})

addHandler('getEpicGamesStatus', async () => isEpicServiceOffline())

addHandler('getRakunVersion', () => rakunVersion)
