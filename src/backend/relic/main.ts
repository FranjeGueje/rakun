import { startDaemon } from './daemon'

startDaemon().catch((error: unknown) => {
  console.error('relicd failed to start:', error)
  process.exit(1)
})
