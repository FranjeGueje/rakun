import { nileRefusedToken } from '../refused_token'

describe('nileRefusedToken', () => {
  test('nile gave up renewing the token: refused', () => {
    expect(
      nileRefusedToken(
        'ERROR [AUTH]:\t Failed to refresh the token {"error":"x"}'
      )
    ).toBe(true)
  })

  test('the same line over a connection that never reached Amazon is not a refusal', () => {
    const offline = [
      'INFO [AUTH]:\t Refreshing token',
      'Failed to refresh the token',
      "requests.exceptions.ConnectionError: HTTPSConnectionPool(host='api.amazon.com', port=443): Max retries exceeded"
    ].join('\n')

    expect(nileRefusedToken(offline)).toBe(false)
    expect(nileRefusedToken('Failed to refresh the token: timed out')).toBe(
      false
    )
  })

  test('output with nothing about the token, or an empty one, is not', () => {
    expect(nileRefusedToken('')).toBe(false)
    expect(nileRefusedToken('ERROR [CLI]:\t No games installed')).toBe(false)
    expect(nileRefusedToken('undefined\nundefined\nundefined')).toBe(false)
  })
})
