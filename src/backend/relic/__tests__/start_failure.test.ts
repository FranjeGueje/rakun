import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { reportStartFailure } from '../start_failure'

describe('reportStartFailure', () => {
  const state = mkdtempSync(join(tmpdir(), 'relicd-state-'))
  const previous = process.env.XDG_STATE_HOME

  beforeEach(() => {
    process.env.XDG_STATE_HOME = state
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())
  afterAll(() => {
    if (previous === undefined) delete process.env.XDG_STATE_HOME
    else process.env.XDG_STATE_HOME = previous
    rmSync(state, { recursive: true, force: true })
  })

  test('puts the reason in the log file as well as on the console', () => {
    reportStartFailure(new Error('listen EADDRINUSE: address already in use'))
    const log = readFileSync(
      join(state, 'Relicd', 'logs', 'relicd.log'),
      'utf-8'
    )
    expect(log).toMatch(/\[ERROR\]: relicd failed to start: listen EADDRINUSE/)
    expect(console.error).toHaveBeenCalled()
  })

  test('a log folder that cannot be written does not hide the failure', () => {
    // a file where a folder should be: the log folder cannot be made
    const file = join(state, 'not-a-folder')
    writeFileSync(file, '')
    process.env.XDG_STATE_HOME = join(file, 'inside')
    expect(() => reportStartFailure(new Error('x'))).not.toThrow()
    expect(console.error).toHaveBeenCalled()
  })
})
