import { exitFailure } from '../helper_result'

describe('exitFailure', () => {
  test('a helper that ended well, or whose code is not known, did not fail', () => {
    expect(exitFailure({ stdout: '', stderr: '', code: 0 })).toBeUndefined()
    expect(exitFailure({ stdout: '', stderr: '' })).toBeUndefined()
    expect(exitFailure({ stdout: '', stderr: '', code: null })).toBeUndefined()
  })

  test('a code other than 0 is a failure, with what the helper said (also on stdout)', () => {
    const message = exitFailure({
      stdout: 'Unable to proceed, Not enough disk space',
      stderr: '[MANAGER] INFO: starting\n',
      code: 2
    })

    expect(message).toContain('code 2')
    expect(message).toContain('Not enough disk space')
  })

  test('a download stopped on purpose is not a failure', () => {
    expect(
      exitFailure({ stdout: '', stderr: '', code: 143, abort: true })
    ).toBeUndefined()
  })

  test('only the last lines are kept, and the message is capped', () => {
    const stderr = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n')

    const message = exitFailure({ stdout: '', stderr, code: 1 }) ?? ''

    expect(message).toContain('line 49')
    expect(message).not.toContain('line 10')
    expect(
      (exitFailure({ stdout: '', stderr: 'x'.repeat(2000), code: 1 }) ?? '')
        .length
    ).toBeLessThanOrEqual(400)
  })
})
