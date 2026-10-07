import { parseServerOptions } from '../options'

describe('parseServerOptions', () => {
  test('without anything it is local and the port is left to api.json', () => {
    expect(parseServerOptions([], {}, undefined)).toEqual({
      web: 'local',
      port: undefined
    })
  })

  test('the saved setting is used when nothing else says', () => {
    expect(parseServerOptions([], {}, 'network').web).toBe('network')
    expect(parseServerOptions([], {}, 'nonsense').web).toBe('local')
  })

  test('the environment wins over the setting, the arguments over the environment', () => {
    expect(parseServerOptions([], { RELICD_WEB: 'off' }, 'network').web).toBe(
      'off'
    )
    expect(
      parseServerOptions(['--web=network'], { RELICD_WEB: 'off' }, 'local').web
    ).toBe('network')
    expect(
      parseServerOptions(
        ['--port', '18000'],
        { RELICD_PORT: '19000' },
        undefined
      ).port
    ).toBe(18000)
    expect(
      parseServerOptions([], { RELICD_PORT: '19000' }, undefined).port
    ).toBe(19000)
  })

  test('accepts both --web=x and --web x', () => {
    expect(parseServerOptions(['--web', 'off'], {}, undefined).web).toBe('off')
    expect(parseServerOptions(['--web=off'], {}, undefined).web).toBe('off')
  })

  test('a mode that does not exist, or a port out of range, is an error that says why', () => {
    expect(() => parseServerOptions(['--web=other'], {}, undefined)).toThrow(
      /local, network, off/
    )
    for (const port of ['0', '70000', 'abc', '1.5'])
      expect(() =>
        parseServerOptions([`--port=${port}`], {}, undefined)
      ).toThrow(/from 1 to 65535/)
  })

  test('an argument it does not know is an error too', () => {
    expect(() => parseServerOptions(['--nope'], {}, undefined)).toThrow()
  })
})
