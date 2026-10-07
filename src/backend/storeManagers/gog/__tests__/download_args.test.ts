import { downloadArgs } from '../download_args'

const base = {
  appName: '123',
  platform: 'windows' as const,
  path: '/games',
  supportPath: '/support/123',
  language: 'en-US',
  maxWorkers: 0,
  branchPassword: ''
}

describe('downloadArgs', () => {
  test('the basic command, skipping DLCs', () => {
    expect(downloadArgs(base)).toEqual([
      'download',
      '123',
      '--platform',
      'windows',
      '--path',
      '/games',
      '--support',
      '/support/123',
      '--skip-dlcs',
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

  test('an empty DLC list still skips them', () => {
    expect(downloadArgs({ ...base, installDlcs: [] })).toContain('--skip-dlcs')
  })

  test('build, branch, workers and branch password only when there are any', () => {
    expect(downloadArgs(base)).not.toEqual(
      expect.arrayContaining([
        '--build',
        '--branch',
        '--max-workers',
        '--password'
      ])
    )

    const args = downloadArgs({
      ...base,
      build: '55',
      branch: 'beta',
      maxWorkers: 4,
      branchPassword: 'pw'
    })

    expect(args).toEqual(
      expect.arrayContaining([
        '--build',
        '55',
        '--branch',
        'beta',
        '--max-workers',
        '4',
        '--password',
        'pw'
      ])
    )
  })
})
