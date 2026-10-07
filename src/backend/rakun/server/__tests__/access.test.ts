import {
  allowedHosts,
  isBlockedFromNetwork,
  isLoopback,
  isOwnOrigin
} from '../access'

describe('isLoopback', () => {
  test('knows the forms of this machine', () => {
    for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '127.1.2.3'])
      expect(isLoopback(address)).toBe(true)
  })

  test('another machine, or nothing, is not this one', () => {
    for (const address of [
      '192.168.1.20',
      '::ffff:192.168.1.20',
      '',
      undefined
    ])
      expect(isLoopback(address)).toBe(false)
  })
})

describe('allowedHosts', () => {
  const names = ['deck', 'deck.local', '192.168.1.20', '[fe80::1]']

  test('local and off answer only to loopback', () => {
    for (const mode of ['local', 'off'] as const) {
      const hosts = allowedHosts(17370, mode, names)
      expect(hosts.has('127.0.0.1:17370')).toBe(true)
      expect(hosts.has('localhost:17370')).toBe(true)
      expect(hosts.has('192.168.1.20:17370')).toBe(false)
    }
  })

  test('network adds the addresses and the names of the machine, with the port', () => {
    const hosts = allowedHosts(17370, 'network', names)
    for (const host of ['deck', 'deck.local', '192.168.1.20', '[fe80::1]'])
      expect(hosts.has(`${host}:17370`)).toBe(true)
    expect(hosts.has('127.0.0.1:17370')).toBe(true)
  })

  test('a domain of somebody else is never allowed (DNS rebinding)', () => {
    expect(
      allowedHosts(17370, 'network', names).has('evil.example:17370')
    ).toBe(false)
    expect(allowedHosts(17370, 'network', names).has('deck:9999')).toBe(false)
  })
})

describe('isOwnOrigin', () => {
  test('no Origin is fine; the page of the same Host is fine; any other is not', () => {
    expect(isOwnOrigin(undefined, '192.168.1.20:17370')).toBe(true)
    expect(isOwnOrigin('http://192.168.1.20:17370', '192.168.1.20:17370')).toBe(
      true
    )
    expect(isOwnOrigin('http://evil.example', '192.168.1.20:17370')).toBe(false)
    expect(
      isOwnOrigin('https://192.168.1.20:17370', '192.168.1.20:17370')
    ).toBe(false)
  })
})

describe('isBlockedFromNetwork', () => {
  const remote = '192.168.1.20'

  test('settings, reset and stop are not answered to the network', () => {
    for (const channel of [
      'writeConfig',
      'setSetting',
      'resetRakun',
      'stopRakun',
      'steamgriddb.setApiKey',
      'importSessionsFromRelic',
      'getPrivateBranchPassword',
      'setPrivateBranchPassword',
      'getLogContent',
      'listFolders',
      'importGame',
      'moveInstall',
      'changeInstallPath'
    ])
      expect(isBlockedFromNetwork(channel, remote, 'network')).toBe(true)
  })

  test('they are answered to this machine, and the rest to everybody', () => {
    expect(
      isBlockedFromNetwork('setSetting', '::ffff:127.0.0.1', 'network')
    ).toBe(false)
    expect(isBlockedFromNetwork('install', remote, 'network')).toBe(false)
    expect(isBlockedFromNetwork('getLibrary', remote, 'network')).toBe(false)
  })

  test('only the network mode has anything to block', () => {
    expect(isBlockedFromNetwork('setSetting', remote, 'local')).toBe(false)
    expect(isBlockedFromNetwork('setSetting', remote, 'off')).toBe(false)
  })
})
