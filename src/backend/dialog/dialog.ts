import { LogPrefix, logError, logInfo, logWarning } from 'backend/logger'
import { ButtonOptions, DialogType } from 'common/types'
import { sendFrontendMessage } from '../ipc'

/**
 * Reports a message to whoever is listening to the daemon: it is logged and
 * published as a `showDialog` event. There is no native dialog to fall back to.
 */
function showDialogBoxModalAuto(props: {
  title: string
  message: string
  type: DialogType
  buttons?: Array<ButtonOptions>
}) {
  const log = props.type === 'ERROR' ? logError : logWarning
  log([props.title, props.message], LogPrefix.Backend)

  sendFrontendMessage(
    'showDialog',
    props.title,
    props.message,
    props.type,
    props.buttons
  )
}

/**
 * Resolves to the index of the button picked. A headless daemon has nobody to
 * ask, so it always picks the first one, which callers keep as the safe
 * choice ("No").
 */
async function askQuestion(props: {
  title: string
  message: string
  buttons: string[]
}): Promise<number> {
  logInfo(
    [`${props.title}: ${props.message}`, `-> "${props.buttons[0]}" (headless)`],
    LogPrefix.Backend
  )
  return 0
}

export { showDialogBoxModalAuto, askQuestion }
