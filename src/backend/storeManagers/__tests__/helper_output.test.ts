import {
  clearHelperOutputWarning,
  HelperOutputError,
  helperOutputWarnings,
  parseHelperJson,
  redactSecrets
} from '../helper_output'

jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

const isList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

afterEach(() => {
  clearHelperOutputWarning('nile', 'list-updates')
  clearHelperOutputWarning('gogdl', 'info')
})

describe('parseHelperJson', () => {
  test('output in the shape rakun reads comes back parsed', () => {
    expect(
      parseHelperJson('nile', 'list-updates', '["a","b"]', isList)
    ).toEqual(['a', 'b'])
  })

  test.each([
    ['not JSON at all', 'Traceback (most recent call last):'],
    ['empty', ''],
    ['another shape', '{"updates":["a"]}'],
    ['null', 'null']
  ])('%s throws a HelperOutputError that says which command', (_, text) => {
    expect(() => parseHelperJson('nile', 'list-updates', text, isList)).toThrow(
      HelperOutputError
    )
    expect(() => parseHelperJson('nile', 'list-updates', text, isList)).toThrow(
      /nile list-updates/
    )
  })

  test('what the error shows of the output has no tokens in it', () => {
    let message = ''
    try {
      parseHelperJson(
        'gogdl',
        'info',
        '{"access_token": "SECRET-1", "refresh_token": "SECRET-2", broken',
        isList
      )
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toContain('gogdl info')
    expect(message).not.toContain('SECRET-')
  })

  test('an unrecognized output is remembered once, and forgotten when the helper is understood again', () => {
    expect(() => parseHelperJson('nile', 'list-updates', 'x', isList)).toThrow()
    expect(() => parseHelperJson('nile', 'list-updates', 'y', isList)).toThrow()
    expect(helperOutputWarnings()).toHaveLength(1)

    parseHelperJson('nile', 'list-updates', '[]', isList)

    expect(helperOutputWarnings()).toEqual([])
  })
})

describe('redactSecrets', () => {
  test('hides tokens in a URL and in JSON, and leaves the rest', () => {
    const text =
      'GET /token?client_secret=SHH&x=1 {"access_token":"AAA","name":"ann"}'

    const safe = redactSecrets(text)

    expect(safe).not.toContain('SHH')
    expect(safe).not.toContain('AAA')
    expect(safe).toContain('"name":"ann"')
  })
})
