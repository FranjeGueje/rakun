import {
  hasDuplicates,
  removeInstalled,
  uniqueInstalled,
  upsertInstalled
} from '../installed_list'

const game = (appName: string, install_path = '/games/' + appName) => ({
  appName,
  install_path
})

describe('upsertInstalled', () => {
  test('adds a game that was not there', () => {
    expect(upsertInstalled([game('a')], game('b'))).toEqual([
      game('a'),
      game('b')
    ])
  })

  test('installing a game again replaces it instead of repeating it', () => {
    const list = [game('a'), game('b')]
    const result = upsertInstalled(list, game('a', '/new'))
    expect(result).toEqual([game('a', '/new'), game('b')])
  })

  test('also collapses the copies a previous version left behind', () => {
    const list = [game('a'), game('b'), game('a'), game('a')]
    expect(upsertInstalled(list, game('a', '/new'))).toEqual([
      game('a', '/new'),
      game('b')
    ])
  })

  test('does not change the list it is given', () => {
    const list = [game('a')]
    upsertInstalled(list, game('a', '/new'))
    expect(list).toEqual([game('a')])
  })
})

describe('removeInstalled', () => {
  test('removes every copy of the game and nothing else', () => {
    const list = [game('a'), game('b'), game('a')]
    expect(removeInstalled(list, 'a')).toEqual([game('b')])
  })

  test('a game that is not there leaves the list alone', () => {
    expect(removeInstalled([game('a')], 'zz')).toEqual([game('a')])
  })
})

describe('uniqueInstalled', () => {
  test('keeps one entry per game, the last, in order', () => {
    const list = [game('a', '/1'), game('b'), game('a', '/2'), game('a', '/3')]
    expect(uniqueInstalled(list)).toEqual([game('b'), game('a', '/3')])
  })

  test('drops entries with no appName', () => {
    expect(uniqueInstalled([{}, game('a')])).toEqual([game('a')])
  })

  test('hasDuplicates says whether it is worth writing the list back', () => {
    expect(hasDuplicates([game('a'), game('b')])).toBe(false)
    expect(hasDuplicates([game('a'), game('a')])).toBe(true)
  })
})
