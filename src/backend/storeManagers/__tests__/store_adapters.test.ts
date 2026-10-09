import type { GameInfo } from 'common/types'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getStore, RUNNERS, stores } from '..'
import { tokenPath } from '../zoom/constants'
import { LegendaryUser } from '../legendary/user'
import { GOGUser } from '../gog/user'
import { NileUser } from '../nile/user'
import { ZoomUser } from '../zoom/user'
import * as legendaryStores from '../legendary/electronStores'
import * as gogStores from '../gog/electronStores'
import * as nileStores from '../nile/electronStores'
import * as zoomStores from '../zoom/electronStores'

jest.mock('backend/constants/paths', () => {
  const { mkdtempSync } = jest.requireActual<typeof import('fs')>('fs')
  const { tmpdir } = jest.requireActual<typeof import('os')>('os')
  const root = mkdtempSync(`${tmpdir()}/rakun-adapters-`)
  return {
    appDataPath: root,
    userDataPath: `${root}/rakun`,
    appFolder: `${root}/rakun`
  }
})
jest.mock('../legendary/user', () => ({
  LegendaryUser: {
    isLoggedIn: jest.fn(),
    getUserInfo: jest.fn(),
    login: jest.fn(),
    logout: jest.fn()
  }
}))
jest.mock('../gog/user', () => ({
  GOGUser: {
    isLoggedIn: jest.fn(),
    getUserDetails: jest.fn(),
    login: jest.fn(),
    logout: jest.fn()
  }
}))
jest.mock('../nile/user', () => ({
  NileUser: {
    isLoggedIn: jest.fn(),
    getUserData: jest.fn(),
    getLoginData: jest.fn(),
    login: jest.fn(),
    logout: jest.fn()
  }
}))
jest.mock('../zoom/user', () => ({
  ZoomUser: { getUserDetails: jest.fn(), login: jest.fn(), logout: jest.fn() }
}))
jest.mock('../legendary/electronStores', () => ({
  libraryStore: { get: jest.fn() }
}))
jest.mock('../nile/electronStores', () => ({
  libraryStore: { get: jest.fn() }
}))
jest.mock('../gog/electronStores', () => ({
  configStore: { get_nodefault: jest.fn(), set: jest.fn() },
  libraryStore: { get: jest.fn() },
  installedGamesStore: { get: jest.fn() }
}))
jest.mock('../zoom/electronStores', () => ({
  configStore: { get: jest.fn(), get_nodefault: jest.fn() },
  libraryStore: { get: jest.fn() },
  installedGamesStore: { get: jest.fn() }
}))

const game = (app_name: string, extra: object = {}) =>
  ({ app_name, title: app_name, is_installed: false, ...extra }) as GameInfo

describe('store identity', () => {
  test('the stores rakun ships with keep their id, name and label', () => {
    expect(
      Object.values(stores).map(({ id, name, label }) => [id, name, label])
    ).toEqual(
      expect.arrayContaining([
        ['legendary', 'epic', 'Epic'],
        ['gog', 'gog', 'GOG'],
        ['nile', 'amazon', 'Amazon'],
        ['zoom', 'zoom', 'Zoom']
      ])
    )
  })
})

describe('getStore', () => {
  test('finds a store by id and refuses one that is not ours', () => {
    expect(getStore('nile')).toBe(stores.nile)
    expect(() => getStore('steam')).toThrow('Unknown store "steam"')
    expect(() => getStore('toString')).toThrow('Unknown store "toString"')
  })
})

describe('Epic', () => {
  test('account joins the local check and the display name', () => {
    jest.mocked(LegendaryUser.isLoggedIn).mockReturnValue(true)
    jest
      .mocked(LegendaryUser.getUserInfo)
      .mockReturnValue({ displayName: 'ann' } as never)

    expect(stores.legendary.session.account()).toEqual({
      loggedIn: true,
      name: 'ann'
    })
  })

  test('submit maps the login status', async () => {
    jest
      .mocked(LegendaryUser.login)
      .mockResolvedValueOnce({ status: 'done', data: undefined })
      .mockResolvedValueOnce({ status: 'failed', data: undefined })

    expect(await stores.legendary.login.submit('c')).toEqual({ ok: true })
    expect(await stores.legendary.login.submit('c')).toEqual({
      ok: false,
      error: 'The store rejected the login'
    })
  })

  test('its library is the manager view, not the stale store', () => {
    jest
      .mocked(legendaryStores.libraryStore.get)
      .mockReturnValue([game('a'), game('b')])
    jest
      .spyOn(stores.legendary.library, 'getGameInfo')
      .mockImplementation((id) =>
        id === 'a' ? game('a', { is_installed: true }) : undefined
      )

    expect(
      stores.legendary.readLibrary().map((g) => [g.app_name, g.is_installed])
    ).toEqual([
      ['a', true],
      ['b', false]
    ])
  })
})

describe('GOG', () => {
  test('account takes the name from the stored user data', () => {
    jest.mocked(GOGUser.isLoggedIn).mockReturnValue(true)
    jest
      .mocked(gogStores.configStore.get_nodefault)
      .mockReturnValue({ username: 'bob' })

    expect(stores.gog.session.account()).toEqual({
      loggedIn: true,
      name: 'bob'
    })
  })

  test('its library carries the install info of the installed store', () => {
    jest
      .mocked(gogStores.libraryStore.get)
      .mockReturnValue([game('x'), game('y')])
    jest
      .mocked(gogStores.installedGamesStore.get)
      .mockReturnValue([{ appName: 'x', platform: 'linux' }])

    const result = stores.gog.readLibrary()

    expect(result[0]).toMatchObject({
      is_installed: true,
      install: { appName: 'x' }
    })
    expect(result[1].is_installed).toBe(false)
  })
})

describe('Amazon', () => {
  test('account reads the user data before asking whether it is logged in', () => {
    const order: string[] = []
    jest.mocked(NileUser.getUserData).mockImplementation(() => {
      order.push('getUserData')
      return { name: 'cy' } as never
    })
    jest.mocked(NileUser.isLoggedIn).mockImplementation(() => {
      order.push('isLoggedIn')
      return true as never
    })

    expect(stores.nile.session.account()).toEqual({
      loggedIn: true,
      name: 'cy'
    })
    expect(order).toEqual(['getUserData', 'isLoggedIn'])
  })

  test('submitting before asking for the login says to ask first', async () => {
    expect(await stores.nile.login.submit('code')).toEqual({
      ok: false,
      error: 'Request the Amazon login (getLoginInfo) first'
    })
  })

  test('the verifier from start() goes with the code and is used once', async () => {
    jest.mocked(NileUser.getLoginData).mockResolvedValue({
      url: 'https://amazon/login',
      code_verifier: 'v',
      serial: 's',
      client_id: 'c'
    })
    jest
      .mocked(NileUser.login)
      .mockResolvedValue({ status: 'done', user: undefined })

    const info = await stores.nile.login.start()
    expect(info).toMatchObject({ runner: 'nile', url: 'https://amazon/login' })

    expect(await stores.nile.login.submit('abc')).toEqual({ ok: true })
    expect(NileUser.login).toHaveBeenCalledWith({
      code: 'abc',
      code_verifier: 'v',
      serial: 's',
      client_id: 'c'
    })
    expect((await stores.nile.login.submit('abc')).ok).toBe(false)
  })
})

describe('Zoom', () => {
  test('account needs the token file as well as the stored flag', () => {
    mkdirSync(join(tokenPath, '..'), { recursive: true })
    jest.mocked(zoomStores.configStore.get).mockReturnValue(true)
    jest.mocked(zoomStores.configStore.get_nodefault).mockReturnValue('di')

    rmSync(tokenPath, { force: true })
    expect(stores.zoom.session.account().loggedIn).toBe(false)

    writeFileSync(tokenPath, 'tok')
    expect(stores.zoom.session.account()).toEqual({
      loggedIn: true,
      name: 'di'
    })
    rmSync(tokenPath)
  })

  test('submit hands Zoom the callback address carrying the token', async () => {
    jest.mocked(ZoomUser.login).mockReturnValue({ status: 'done' })

    expect(await stores.zoom.login.submit('a b')).toEqual({ ok: true })

    const url = new URL(jest.mocked(ZoomUser.login).mock.calls[0][0])
    expect(url.origin).toBe('https://www.zoom-platform.com')
    expect(url.searchParams.get('li_token')).toBe('a b')
    expect(ZoomUser.getUserDetails).toHaveBeenCalled()
  })

  test('a rejected token does not ask for the user details', async () => {
    jest.mocked(ZoomUser.login).mockReturnValue({ status: 'error' })

    expect(await stores.zoom.login.submit('x')).toEqual({
      ok: false,
      error: 'The store rejected the login'
    })
    expect(ZoomUser.getUserDetails).not.toHaveBeenCalled()
  })
})

// What every store has to offer, whatever it wraps. A new store is added to
// `stores` and this is what it has to pass.
describe('store contract', () => {
  beforeEach(() => {
    jest.mocked(LegendaryUser.isLoggedIn).mockReturnValue(false)
    jest.mocked(GOGUser.isLoggedIn).mockReturnValue(false)
    jest.mocked(NileUser.isLoggedIn).mockReturnValue(false)
    jest.mocked(legendaryStores.libraryStore.get).mockReturnValue([])
    jest.mocked(nileStores.libraryStore.get).mockReturnValue([])
    jest.mocked(gogStores.libraryStore.get).mockReturnValue([])
    jest.mocked(gogStores.installedGamesStore.get).mockReturnValue([])
    jest.mocked(zoomStores.libraryStore.get).mockReturnValue([])
    jest.mocked(zoomStores.installedGamesStore.get).mockReturnValue([])
  })

  const all = Object.entries(stores)

  test('the registry is keyed by id and RUNNERS lists every store', () => {
    expect(RUNNERS).toEqual(Object.keys(stores))
    all.forEach(([key, store]) => expect(store.id).toBe(key))
  })

  test('names and labels are unique, and names are easy to type', () => {
    const names = all.map(([, store]) => store.name)
    const labels = all.map(([, store]) => store.label)
    expect(new Set(names).size).toBe(names.length)
    expect(new Set(labels).size).toBe(labels.length)
    names.forEach((name) => expect(name).toMatch(/^[a-z0-9]+$/))
    labels.forEach((label) => expect(label.trim()).not.toBe(''))
  })

  test.each(all)(
    '%s: the library manager has the whole interface',
    (_id, s) => {
      const methods = [
        'init',
        'getGame',
        'refresh',
        'getGameInfo',
        'getInstallInfo',
        'listUpdateableGames',
        'changeGameInstallPath',
        'changeVersionPinnedStatus'
      ]
      methods.forEach((method) =>
        expect(
          typeof (s.library as unknown as Record<string, unknown>)[method]
        ).toBe('function')
      )
    }
  )

  test.each(all)('%s: reads its library as an array', (_id, s) => {
    expect(Array.isArray(s.readLibrary())).toBe(true)
  })

  test.each(all)(
    '%s: knows who is logged in without asking the store',
    (_id, s) => {
      expect(typeof s.session.account().loggedIn).toBe('boolean')
    }
  )

  test.each(all)('%s: can log in and out', (_id, s) => {
    expect(s.login.urlParam).not.toBe('')
    ;[s.login.start, s.login.submit, s.session.logout].forEach((fn) =>
      expect(typeof fn).toBe('function')
    )
  })
})
