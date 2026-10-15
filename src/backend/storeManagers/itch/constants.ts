import { join } from 'path'
import { userDataPath } from 'backend/constants/paths'

const itchSupportPath = join(userDataPath, 'itch_store')
export const butlerDbPath = join(itchSupportPath, 'butler.db')
export const apiKeysUrl = 'https://itch.io/user/settings/api-keys'
