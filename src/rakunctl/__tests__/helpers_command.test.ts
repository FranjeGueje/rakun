import { CliError } from '../client'
import { helpers, helpersLine, helpersText } from '../commands/helpers'
import { fakeCtx, opts } from './helpers'

const list = [
  { helper: 'legendary', pinned: '0.21.1', installed: '0.21.1', state: 'ok' },
  { helper: 'gogdl', pinned: 'v1.3.0', installed: '', state: 'missing' },
  { helper: 'nile', pinned: 'v1.2.0', installed: 'v9.0.0', state: 'other' }
]

describe('helpersText', () => {
  test('a table of the helper, what it should be, what it is, and its state', () => {
    const text = helpersText(list as never)
    expect(text).toMatch(/HELPER\s+PINNED\s+INSTALLED\s+STATE/)
    expect(text).toMatch(/legendary\s+0\.21\.1\s+0\.21\.1\s+ok/)
    expect(text).toMatch(/gogdl\s+v1\.3\.0\s+-\s+missing/)
    expect(text).toMatch(/nile\s+v1\.2\.0\s+v9\.0\.0\s+other/)
  })
})

describe('helpersLine', () => {
  test('names what is missing and what to run', () => {
    expect(helpersLine(list as never)).toBe(
      'Helpers: missing gogdl (run "rakunctl helpers update")'
    )
  })

  test('says so when nothing is missing, even if another version is installed', () => {
    expect(
      helpersLine(list.filter((h) => h.state !== 'missing') as never)
    ).toBe('Helpers: all installed')
  })
})

describe('rakunctl helpers', () => {
  test('lists the helpers', async () => {
    const { ctx, lines } = fakeCtx({ getHelpers: list })
    await helpers(ctx, [], opts)
    expect(lines[0]).toContain('gogdl')
  })

  test('--json gives the list as it is', async () => {
    const { ctx, lines } = fakeCtx({ getHelpers: list }, [], true)
    await helpers(ctx, [], opts)
    expect(JSON.parse(lines[0])).toEqual(list)
  })

  test('an unknown subcommand is refused', async () => {
    const { ctx } = fakeCtx({ getHelpers: list })
    await expect(helpers(ctx, ['nope'], opts)).rejects.toThrow(
      'Unknown helpers command "nope"'
    )
  })

  describe('update', () => {
    const progress = (line: string) => ({
      event: 'helpersProgress',
      args: [line]
    })

    test('shows what rakun says until it is done, then the table', async () => {
      const { ctx, calls, lines } = fakeCtx(
        { updateHelpers: { helpers: list, failures: [] } },
        [
          progress('Downloading gogdl v1.3.0'),
          progress('done'),
          progress('late')
        ]
      )

      await helpers(ctx, ['update'], opts)

      expect(calls).toContainEqual(['updateHelpers', [{ latest: false }]])
      expect(lines[0]).toBe('Downloading gogdl v1.3.0')
      // «done» is the end of the stream, not a line to show
      expect(lines).not.toContain('done')
      expect(lines).not.toContain('late')
      expect(lines[1]).toMatch(/HELPER\s+PINNED/)
    })

    test('--latest is sent', async () => {
      const { ctx, calls } = fakeCtx(
        { updateHelpers: { helpers: list, failures: [] } },
        [progress('done')]
      )

      await helpers(ctx, ['update'], { ...opts, latest: true })

      expect(calls).toContainEqual(['updateHelpers', [{ latest: true }]])
    })

    test('a helper that failed makes it an error, with the reason', async () => {
      const { ctx } = fakeCtx(
        {
          updateHelpers: {
            helpers: list,
            failures: [{ helper: 'nile', error: 'HTTP 404' }]
          }
        },
        [progress('done')]
      )

      const failed = helpers(ctx, ['update'], opts)
      await expect(failed).rejects.toBeInstanceOf(CliError)
      await expect(failed).rejects.toThrow('nile: HTTP 404')
    })
  })
})
