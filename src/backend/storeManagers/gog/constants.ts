import { appFolder, userDataPath } from 'backend/constants/paths'
import { join } from 'path'

export const gogdlConfigPath = join(appFolder, 'gogdlConfig', 'heroic_gogdl')
export const gogSupportPath = join(gogdlConfigPath, 'gog-support')
// gogdl needs a language to install; this is the one used when none is given
export const defaultInstallLanguage = 'en-US'
export const gogdlAuthConfig = join(userDataPath, 'gog_store', 'auth.json')
