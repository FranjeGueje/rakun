import { appFolder } from 'backend/constants/paths'
import { join } from 'path'

export const legendaryConfigPath = join(
  appFolder,
  'legendaryConfig',
  'legendary'
)
export const legendaryUserInfo = join(legendaryConfigPath, 'user.json')
export const legendaryInstalled = join(legendaryConfigPath, 'installed.json')
export const legendaryMetadata = join(legendaryConfigPath, 'metadata')
