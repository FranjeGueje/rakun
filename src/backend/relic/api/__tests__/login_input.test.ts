import { extractLoginCode } from '../login_input'

describe('extractLoginCode', () => {
  test('Epic: the JSON of the login page, or the bare code', () => {
    expect(
      extractLoginCode(
        'legendary',
        '{"redirectUrl":"x","authorizationCode":"abc123","sid":null}'
      )
    ).toBe('abc123')
    expect(extractLoginCode('legendary', '  abc123\n')).toBe('abc123')
    expect(extractLoginCode('legendary', '{"authorizationCode":null}')).toBe(
      undefined
    )
  })

  test('Epic and GOG: the `code` of a redirect address', () => {
    expect(
      extractLoginCode('legendary', 'http://localhost/?code=abc123&state=1')
    ).toBe('abc123')
    expect(
      extractLoginCode(
        'gog',
        'https://embed.gog.com/on_login_success?origin=client&code=GOGCODE'
      )
    ).toBe('GOGCODE')
  })

  test('Amazon: the authorization code of the final address', () => {
    expect(
      extractLoginCode(
        'nile',
        'https://www.amazon.com/ap/maplanding?openid.oa2.authorization_code=AMZ&x=1'
      )
    ).toBe('AMZ')
  })

  test('Zoom: always returns a callback URL carrying li_token', () => {
    const url = extractLoginCode(
      'zoom',
      'https://www.zoom-platform.com/?li_token=TOK123'
    )
    expect(new URL(url!).searchParams.get('li_token')).toBe('TOK123')
    expect(
      new URL(extractLoginCode('zoom', 'TOK123')!).searchParams.get('li_token')
    ).toBe('TOK123')
  })

  test('nothing usable', () => {
    expect(extractLoginCode('gog', '')).toBeUndefined()
    expect(
      extractLoginCode('gog', 'https://embed.gog.com/on_login_success')
    ).toBeUndefined()
    expect(extractLoginCode('legendary', 'two words')).toBeUndefined()
  })
})
