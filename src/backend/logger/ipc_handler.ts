import { addHandler } from 'backend/ipc'
import { existsSync, readFileSync } from 'fs'

import { isSafeLogRequest } from './log_request'
import { getLogFilePath } from './paths'

addHandler('getLogContent', (event, args) => {
  if (!isSafeLogRequest(args)) return ''
  const logPath = getLogFilePath(args)
  return existsSync(logPath) ? readFileSync(logPath, 'utf-8') : ''
})
