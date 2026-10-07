import { isSafeLogRequest } from '../log_request'

describe('isSafeLogRequest', () => {
  test.each([
    [{}],
    [{ runner: 'gog' }],
    [{ appName: '1423049311', runner: 'gog' }],
    [{ appName: 'Fortnite_v1.2', runner: 'legendary', type: 'install' }]
  ])('accepts %j', (args) => {
    expect(isSafeLogRequest(args)).toBe(true)
  })

  test.each([
    [undefined],
    [null],
    ['rakun'],
    [{ appName: '../../x', runner: 'gog' }],
    [{ appName: '..', runner: 'gog' }],
    [{ appName: '.', runner: 'gog' }],
    [{ appName: 'a/b', runner: 'gog' }],
    [{ appName: 'a\\b', runner: 'gog' }],
    [{ appName: '', runner: 'gog' }],
    [{ appName: 'game' }],
    [{ appName: 'game', runner: '../gog' }],
    [{ appName: 'game', runner: 'steam' }],
    [{ runner: '../../etc' }],
    [{ appName: 'game', runner: 'gog', type: '../../etc/passwd' }],
    [{ appName: 'game', runner: 'gog', type: 'dance' }],
    [{ type: 'install' }],
    [{ appName: 42, runner: 'gog' }]
  ])('rejects %j', (args) => {
    expect(isSafeLogRequest(args)).toBe(false)
  })
})
