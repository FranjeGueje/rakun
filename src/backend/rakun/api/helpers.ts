import { HELPERS_DONE, type HelpersUpdate } from 'common/rakun/helpers'
import { addHandler, sendFrontendMessage } from 'backend/ipc'
import { logError, logInfo } from 'backend/logger'
import { downloadHelpers } from 'backend/rakun/helpers/download'
import { currentHelpers, helpersLayout } from 'backend/rakun/helpers/locations'

const LOG_PREFIX = 'Rakun'

// Two downloads at once would write the same files: a second request joins the first
let running: Promise<HelpersUpdate> | undefined

async function update(latest: boolean): Promise<HelpersUpdate> {
  const failures = await downloadHelpers(helpersLayout(), {
    latest,
    onProgress: (line) => {
      logInfo(line, LOG_PREFIX)
      sendFrontendMessage('helpersProgress', line)
    }
  })
  failures.forEach(({ helper, error }) =>
    logError(`Could not install ${helper}: ${error}`, LOG_PREFIX)
  )
  return { helpers: currentHelpers(), failures }
}

addHandler('getHelpers', () => currentHelpers())

/** Downloads the helpers that are missing or not at the pinned version (all of them with `latest`) */
addHandler('updateHelpers', (_e, { latest } = {}) => {
  running ??= update(!!latest).finally(() => {
    running = undefined
    sendFrontendMessage('helpersProgress', HELPERS_DONE)
  })
  return running
})
