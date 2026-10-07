import { Path, isPath, schema } from '../schemas'
import {
  LegendaryAppName,
  LegendaryPlatform,
  NonEmptyString,
  PositiveInteger,
  URI,
  URL
} from '../storeManagers/legendary/commands/base'

describe('schema', () => {
  test('gives the value back when it is valid and throws when it is not', () => {
    const even = schema<number>(
      'Even',
      (v) => typeof v === 'number' && v % 2 === 0
    )
    expect(even.parse(4)).toBe(4)
    expect(() => even.parse(3)).toThrow('Invalid Even: 3')
  })
})

describe('Path', () => {
  test('needs a root: it has to be an absolute path', () => {
    expect(Path.parse('/games/one')).toBe('/games/one')
    expect(() => Path.parse('games/one')).toThrow('Invalid Path')
    expect(() => Path.parse('')).toThrow()
    expect(() => Path.parse(42)).toThrow()
    expect(isPath('/x')).toBe(true)
  })
})

describe('legendary command values', () => {
  test('LegendaryAppName is any string', () => {
    expect(LegendaryAppName.parse('Fortnite')).toBe('Fortnite')
    expect(() => LegendaryAppName.parse(1)).toThrow()
  })

  test('LegendaryPlatform is one of the three platforms', () => {
    expect(LegendaryPlatform.parse('Windows')).toBe('Windows')
    expect(LegendaryPlatform.parse('Win32')).toBe('Win32')
    expect(LegendaryPlatform.parse('Mac')).toBe('Mac')
    expect(() => LegendaryPlatform.parse('Linux')).toThrow(
      'Invalid LegendaryPlatform'
    )
  })

  test('NonEmptyString refuses the empty string', () => {
    expect(NonEmptyString.parse('x')).toBe('x')
    expect(() => NonEmptyString.parse('')).toThrow()
    expect(() => NonEmptyString.parse(undefined)).toThrow()
  })

  test('PositiveInteger is a whole number above zero', () => {
    expect(PositiveInteger.parse(5000)).toBe(5000)
    expect(() => PositiveInteger.parse(0)).toThrow()
    expect(() => PositiveInteger.parse(-1)).toThrow()
    expect(() => PositiveInteger.parse(1.5)).toThrow()
    expect(() => PositiveInteger.parse('3')).toThrow()
  })

  test('URL parses as an address', () => {
    expect(URL.parse('https://example.org/manifest')).toBe(
      'https://example.org/manifest'
    )
    expect(() => URL.parse('not a url')).toThrow()
  })

  test('URI is an address or an absolute path', () => {
    expect(URI.parse('https://example.org/m')).toBe('https://example.org/m')
    expect(URI.parse('/tmp/manifest')).toBe('/tmp/manifest')
    expect(() => URI.parse('manifest')).toThrow('Invalid URI')
  })
})
