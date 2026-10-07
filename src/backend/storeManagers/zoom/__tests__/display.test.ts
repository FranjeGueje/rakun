import { displayForInstaller } from '../display'

const socket = (exists: boolean) => () => exists
const env = (display?: string): NodeJS.ProcessEnv => ({ DISPLAY: display })

describe('displayForInstaller', () => {
  test('no DISPLAY means no screen', () => {
    expect(displayForInstaller(env(), socket(true), false)).toEqual({
      ok: false,
      reason: expect.stringContaining('no screen')
    })
    expect(displayForInstaller(env(''), socket(true), false).ok).toBe(false)
  })

  test('game mode is not a screen for the installer, even with a socket', () => {
    const result = displayForInstaller(env(':0'), socket(true), true)
    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining('game mode')
    })
  })

  test('a local display needs its X socket', () => {
    expect(displayForInstaller(env(':0'), socket(true), false).ok).toBe(true)
    expect(displayForInstaller(env(':0.0'), socket(true), false).ok).toBe(true)
    expect(displayForInstaller(env(':1'), socket(false), false)).toEqual({
      ok: false,
      reason: expect.stringContaining('does not answer')
    })
  })

  test('looks for the socket of that display number', () => {
    const asked: string[] = []
    displayForInstaller(env(':7.1'), (path) => !!asked.push(path), false)
    expect(asked).toEqual(['/tmp/.X11-unix/X7'])
  })

  test('a remote display is accepted without looking', () => {
    const asked: string[] = []
    const result = displayForInstaller(
      env('pc:0'),
      (p) => !!asked.push(p),
      false
    )
    expect(result.ok).toBe(true)
    expect(asked).toEqual([])
  })
})
