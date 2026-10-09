import { downloadArgs } from '../download_args'

const base = {
  appName: '123',
  platform: 'windows' as const,
  path: '/games',
  supportPath: '/support/123',
  language: 'en-US',
  maxWorkers: 0
}

describe('downloadArgs', () => {
  test('the basic command, with every DLC', () => {
    expect(downloadArgs(base)).toEqual([
      'download',
      '123',
      '--platform',
      'windows',
      '--path',
      '/games',
      '--support',
      '/support/123',
      '--with-dlcs',
      '--lang',
      'en-US'
    ])
  })

  test('passes the language it is given, and never the text "undefined"', () => {
    const args = downloadArgs({ ...base, language: 'es-ES' })

    expect(args[args.indexOf('--lang') + 1]).toBe('es-ES')
    expect(args).not.toContain('undefined')
  })

  test('installs the DLCs asked for', () => {
    const args = downloadArgs({ ...base, installDlcs: ['1', '2'] })

    expect(args).toEqual(
      expect.arrayContaining(['--with-dlcs', '--dlcs', '1,2'])
    )
    expect(args).not.toContain('--skip-dlcs')
  })

  test('an empty DLC list skips them', () => {
    const args = downloadArgs({ ...base, installDlcs: [] })

    expect(args).toContain('--skip-dlcs')
    expect(args).not.toContain('--with-dlcs')
  })

  test('build, branch, workers and branch password only when there are any', () => {
    expect(downloadArgs(base)).not.toEqual(
      expect.arrayContaining(['--build', '--branch', '--max-workers'])
    )

    const args = downloadArgs({
      ...base,
      build: '55',
      branch: 'beta',
      maxWorkers: 4
    })

    expect(args).toEqual(
      expect.arrayContaining([
        '--build',
        '55',
        '--branch',
        'beta',
        '--max-workers',
        '4'
      ])
    )
  })
})
