import { startDaemon } from './daemon'
import { reportStartFailure } from './start_failure'

startDaemon().catch((error: unknown) => {
  reportStartFailure(error)
  process.exit(1)
})
