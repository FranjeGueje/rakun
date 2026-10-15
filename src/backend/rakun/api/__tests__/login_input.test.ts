import { extractLoginCode } from '../login_input'

const CODE = 'code'
const AMAZON = 'openid.oa2.authorization_code'

describe('extractLoginCode', () => {
  test('Epic: the JSON of the login page, or the bare code', () => {
    expect(
      extractLoginCode(
        CODE,
        '{"redirectUrl":"x","authorizationCode":"abc123","sid":null}'
      )
    ).toBe('abc123')
    expect(extractLoginCode(CODE, '  abc123\n')).toBe('abc123')
    expect(extractLoginCode(CODE, '{"authorizationCode":null}')).toBe(undefined)
  })

  test('Epic and GOG: the `code` of a redirect address', () => {
    expect(
      extractLoginCode(CODE, 'http://localhost/?code=abc123&state=1')
    ).toBe('abc123')
    expect(
      extractLoginCode(
        CODE,
        'https://embed.gog.com/on_login_success?origin=client&code=GOGCODE'
      )
    ).toBe('GOGCODE')
  })

  test('itch.io: the code of the callback address, a refusal has none, a bare token is itself', () => {
    expect(
      extractLoginCode(
        CODE,
        'http://127.0.0.1:17370/itch/callback?code=ITCHCODE&state=abc-DEF_1'
      )
    ).toBe('ITCHCODE')
    expect(
      extractLoginCode(
        CODE,
        'http://127.0.0.1:17370/itch/callback?error=access_denied&state=abc'
      )
    ).toBe(undefined)
    expect(extractLoginCode(CODE, '  AbCdEf0123456789  ')).toBe(
      'AbCdEf0123456789'
    )
  })

  test('Amazon: the authorization code of the final address', () => {
    expect(
      extractLoginCode(
        AMAZON,
        'https://www.amazon.com/ap/maplanding?openid.oa2.authorization_code=AMZ&x=1'
      )
    ).toBe('AMZ')
  })

  test('Zoom: the li_token of the final address, or the bare token', () => {
    expect(
      extractLoginCode(
        'li_token',
        'https://www.zoom-platform.com/?li_token=TOK123'
      )
    ).toBe('TOK123')
    expect(extractLoginCode('li_token', 'TOK123')).toBe('TOK123')
  })

  test('nothing usable', () => {
    expect(extractLoginCode(CODE, '')).toBeUndefined()
    expect(
      extractLoginCode(CODE, 'https://embed.gog.com/on_login_success')
    ).toBeUndefined()
    expect(extractLoginCode(CODE, 'two words')).toBeUndefined()
  })
})
