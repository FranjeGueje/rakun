import { TypeCheckedStoreBackend } from '../electron_store'

export const configStore = new TypeCheckedStoreBackend('configStore', {
  cwd: 'store'
})
