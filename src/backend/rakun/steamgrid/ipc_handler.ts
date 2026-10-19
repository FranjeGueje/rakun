import { GlobalConfig } from 'backend/config'
import { addHandler } from 'backend/ipc'

// The key itself is saved with `setSetting` and never sent back to a client
addHandler(
  'steamgriddb.hasApiKey',
  () => !!GlobalConfig.get().getSettings().steamGridDbApiKey
)
