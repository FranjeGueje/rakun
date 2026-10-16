// What nile writes when Amazon will not renew the token. Found in nile's own
// code: AuthenticationManager.refresh_token logs «Failed to refresh the token»
// and gives up. The same line comes when the request never reached Amazon, so
// a connection failure (nile prints a ConnectionError / «Max retries exceeded»
// traceback) is not a refusal.
const REFUSED = 'Failed to refresh the token'
const NO_CONNECTION =
  /ConnectionError|Max retries exceeded|Network is unreachable|Name or service not known|Failed to establish a new connection|timed out/i

/** The output of a nile command says Amazon refused to renew the session token */
export function nileRefusedToken(output: string): boolean {
  return output.includes(REFUSED) && !NO_CONNECTION.test(output)
}
