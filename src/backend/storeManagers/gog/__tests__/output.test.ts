import { writerFailureWatcher } from '../output'

describe('writerFailureWatcher', () => {
  test('progress alone is not a failure', () => {
    const writer = writerFailureWatcher()
    writer.watch('[PROGRESS] INFO: = Progress: 27.04 13315414038/49245781625\n')

    expect(writer.failure()).toBeUndefined()
  })

  test('«Task writer failed» is a failure, even with more output after it', () => {
    const writer = writerFailureWatcher()
    writer.watch(
      'source file too short\n[TASK_EXEC] CRITICAL: Task writer failed\n'
    )
    writer.watch('[PROGRESS] INFO: = Downloaded: 724.49 MiB\n')

    expect(writer.failure()).toContain('Task writer failed')
  })

  test('the message is found when it comes split in two chunks', () => {
    const writer = writerFailureWatcher()
    writer.watch('[TASK_EXEC] CRITICAL: Task wri')
    writer.watch('ter failed\n')

    expect(writer.failure()).toContain('Task writer failed')
  })
})
