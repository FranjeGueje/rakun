export function overrideProcessPlatform(os: string): string {
  const original_os = process.platform

  // override process.platform
  Object.defineProperty(process, 'platform', {
    value: os
  })

  return original_os
}

jest.mock('../logger')

describe('Constants - getShell', () => {
  async function getShell(): Promise<string> {
    jest.resetModules()
    return import('../constants/others').then((module) => {
      return module.execOptions.shell
    })
  }

  test('get shell for linux', async () => {
    // override platform
    const originalPlatform = overrideProcessPlatform('linux')

    const shell = await getShell()
    expect(shell).toBe('/bin/bash')

    // get back to original platform
    overrideProcessPlatform(originalPlatform)
  })

  test('get default shell for unix os', async () => {
    // override platform
    const originalPlatform = overrideProcessPlatform('linux')

    const shell = await getShell()
    expect(shell).toBe('/bin/bash')

    // get back to original platform
    overrideProcessPlatform(originalPlatform)
  })
})
