import type { GameInfo } from 'common/types'
import { gamesListText } from '../games_list'

const game = (title: string, app_name: string, install: object = {}) =>
  ({ title, app_name, install }) as GameInfo

describe('gamesListText', () => {
  test('one line per game with its app name, and the total', () => {
    expect(gamesListText([game('Alpha', 'a1')])).toBe(
      'Games List:\n* Alpha (App name: a1)\n\nTotal: 1\n'
    )
  })

  test('sorts by title ignoring case', () => {
    const text = gamesListText([
      game('zeta', 'z'),
      game('Beta', 'b'),
      game('alpha', 'a')
    ])

    expect(text.split('\n').slice(1, 4)).toEqual([
      '* alpha (App name: a)',
      '* Beta (App name: b)',
      '* zeta (App name: z)'
    ])
  })

  test('marks the DLCs', () => {
    const text = gamesListText([
      game('Base', 'b'),
      game('Extra', 'e', { is_dlc: true })
    ])

    expect(text).toContain('* Extra (App name: e) - DLC')
    expect(text).not.toContain('* Base (App name: b) - DLC')
  })

  test('a game without install data is not an error', () => {
    const noInstall = { title: 'Raw', app_name: 'r' } as GameInfo

    expect(gamesListText([noInstall])).toContain('* Raw (App name: r)\n')
  })

  test('an empty library still has its header and total', () => {
    expect(gamesListText([])).toBe('Games List:\n\n\nTotal: 0\n')
  })
})
