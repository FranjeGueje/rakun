import { installCommand } from '../install_command'
import type { LegendaryAppName } from '../commands/base'

const base = {
  appName: 'abc' as LegendaryAppName,
  platform: 'Windows',
  path: '/games',
  maxWorkers: 0
}

describe('installCommand', () => {
  test('installs the DLCs by default', () => {
    const command = installCommand(base)

    expect(command['--with-dlcs']).toBe(true)
    expect(command['--skip-dlcs']).toBeUndefined()
  })

  test('an empty DLC list skips them', () => {
    const command = installCommand({ ...base, installDlcs: [] })

    expect(command['--skip-dlcs']).toBe(true)
    expect(command['--with-dlcs']).toBeUndefined()
  })

  test('legendary cannot pick DLCs, so a list installs them all', () => {
    expect(installCommand({ ...base, installDlcs: ['x'] })['--with-dlcs']).toBe(
      true
    )
  })

  test('basics: subcommand, platform, base path and no questions', () => {
    expect(installCommand(base)).toMatchObject({
      subcommand: 'install',
      appName: 'abc',
      '--platform': 'Windows',
      '--base-path': '/games',
      '-y': true
    })
  })

  test('skips the SDL tags unless some are asked for', () => {
    expect(installCommand(base)['--skip-sdl']).toBe(true)

    const command = installCommand({ ...base, sdlList: ['hd'] })
    expect(command.sdlList).toEqual(['hd'])
    expect(command['--skip-sdl']).toBeUndefined()
  })

  test('limits the workers only when configured', () => {
    expect(installCommand(base)['--max-workers']).toBeUndefined()
    expect(installCommand({ ...base, maxWorkers: 4 })['--max-workers']).toBe(4)
  })

  test('refuses a platform legendary does not know', () => {
    expect(() => installCommand({ ...base, platform: 'Linux' })).toThrow()
  })
})
