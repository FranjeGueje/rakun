import { loadOrCreateCredentials } from './credentials'
import { createApiServer, listenApiServer } from './server'

export async function startApiServer() {
  const credentials = loadOrCreateCredentials()
  await listenApiServer(createApiServer(credentials.token), credentials.port)
}
