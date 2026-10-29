import { exitFailure, failureWatcher } from '../helper_result'

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

describe('failureWatcher', () => {
  const gogdl = () => failureWatcher('gogdl', /Task writer failed/)

  test('progress alone is not a failure', () => {
    const watcher = gogdl()
    watcher.watch(
      '[PROGRESS] INFO: = Progress: 27.04 13315414038/49245781625\n'
    )

    expect(watcher.failure()).toBeUndefined()
  })

  test('what the helper said is the failure, even with more output after it', () => {
    const watcher = gogdl()
    watcher.watch(
      'source file too short\n[TASK_EXEC] CRITICAL: Task writer failed\n'
    )
    watcher.watch('[PROGRESS] INFO: = Downloaded: 724.49 MiB\n')

    expect(watcher.failure()).toBe(
      "gogdl said «Task writer failed»: see the game's log"
    )
  })

  test('it is found when it comes split in two chunks', () => {
    const watcher = gogdl()
    watcher.watch('[TASK_EXEC] CRITICAL: Task wri')
    watcher.watch('ter failed\n')

    expect(watcher.failure()).toContain('Task writer failed')
  })

  test('the first failure is the one kept, with the file it names', () => {
    const watcher = failureWatcher('nile', /Checksum error for [^\n]*/)
    watcher.watch('Checksum error for /g/a.exe\nChecksum error for /g/b.pak\n')

    expect(watcher.failure()).toContain('/g/a.exe')
    expect(watcher.failure()).not.toContain('/g/b.pak')
  })
})
