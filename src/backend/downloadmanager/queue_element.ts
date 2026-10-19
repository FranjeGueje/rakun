import type { DMQueueElement, InstallParams, UpdateParams } from 'common/types'

/** A new element of the download queue, not started yet */
export function queueElement(
  type: DMQueueElement['type'],
  params: InstallParams
): DMQueueElement {
  return { params, type, addToQueueTime: Date.now(), endTime: 0, startTime: 0 }
}

/** The update of an installed game: where it is and its platform come from its install */
export function updateElement(params: UpdateParams): DMQueueElement {
  const { install_path, platform } = params.gameInfo.install
  return queueElement('update', {
    ...params,
    path: install_path!,
    platformToInstall: platform!
  })
}
