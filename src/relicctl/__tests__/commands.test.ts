import { CliError } from '../client'
import { parseStore } from '../stores'
import { libraryText, table } from '../format'
import { importRelic, login, logout, status } from '../commands/accounts'
import { library, refresh } from '../commands/library'
import {
  followGame,
  install,
  platformFor,
  repair,
  uninstall,
  update
} from '../commands/games'
import { parseCallArgs, call } from '../commands/call'
import { cancel, pause, queue, resume } from '../commands/queue'
import { cache, reset } from '../commands/maintenance'
import { logs } from '../commands/logs'
import { config, parseValue, settingKey } from '../commands/config'
import { parseCli, runCli } from '../cli'
import type { GameInfo } from 'common/types'
import { fakeCtx, opts, STORES } from './helpers'

const game = (extra: Partial<GameInfo> = {}) =>
  ({
    app_name: 'g1',
    runner: 'gog',
    title: 'Game One',
    is_installed: false,
    ...extra
  }) as GameInfo

const update1 = (status: string, appName = 'g1') => ({
  event: 'gameStatusUpdate',
  args: [{ appName, status }]
})

describe('stores', () => {
  test('accepts friendly and runner names', () => {
    expect(parseStore(STORES, 'epic').id).toBe('legendary')
    expect(parseStore(STORES, 'legendary').id).toBe('legendary')
    expect(parseStore(STORES, 'amazon').id).toBe('nile')
  })

  test('rejects an unknown store listing the valid ones', () => {
    expect(() => parseStore(STORES, 'steam')).toThrow(/epic, gog, amazon, zoom/)
    expect(() => parseStore(STORES, undefined)).toThrow(CliError)
  })
})

describe('format', () => {
  test('table aligns columns and trims the end', () => {
    expect(
      table([
        ['a', 'bb'],
        ['ccc', 'd']
      ])
    ).toBe('a    bb\nccc  d')
  })

  test('library lists store and install state', () => {
    expect(libraryText([game({ is_installed: true })], STORES)).toBe(
      'g1  GOG  Game One  instalado'
    )
    expect(libraryText([], STORES)).toMatch(/vacía/)
  })
})

describe('accounts commands', () => {
  test('status shows version, sessions and queue', async () => {
    const { ctx, lines } = fakeCtx({
      getAccounts: {
        legendary: { loggedIn: true, name: 'ann' },
        gog: { loggedIn: false },
        nile: { loggedIn: false },
        zoom: { loggedIn: false }
      },
      getDMQueueInformation: { elements: [1, 2], finished: [] }
    })

    await status(ctx, [], opts)

    expect(lines[0]).toContain('relicd 1.2.3')
    expect(lines[0]).toContain('Epic: sesión iniciada (ann)')
    expect(lines[0]).toContain('GOG: sin sesión')
    expect(lines[0]).toContain('Cola: 2 pendientes')
  })

  test('login asks for the paste and submits it with the runner name', async () => {
    const { ctx, calls } = fakeCtx({
      getLoginInfo: { url: 'http://x', instructions: 'do it' },
      submitLogin: { ok: true }
    })

    await login(ctx, ['amazon'], opts)

    expect(calls).toEqual([
      ['getLoginInfo', ['nile']],
      ['submitLogin', ['nile', 'pasted']]
    ])
  })

  test('login fails with the store error', async () => {
    const { ctx } = fakeCtx({
      getLoginInfo: { url: 'http://x', instructions: '' },
      submitLogin: { ok: false, error: 'bad code' }
    })

    await expect(login(ctx, ['gog'], opts)).rejects.toThrow('bad code')
  })

  test('logout calls the store channel', async () => {
    const { ctx, calls } = fakeCtx()
    await logout(ctx, ['epic'], opts)
    expect(calls).toEqual([['logout', ['legendary']]])
  })

  test('import-relic prints each store', async () => {
    const { ctx, lines } = fakeCtx({
      importSessionsFromRelic: {
        legendary: 'imported',
        gog: 'missing',
        nile: 'already',
        zoom: 'invalid'
      }
    })

    await importRelic(ctx, [], opts)

    expect(lines[0]).toBe(
      'Epic: imported\nGOG: missing\nAmazon: already\nZoom: invalid'
    )
  })

  test('a missing argument is a usage error', async () => {
    const { ctx } = fakeCtx()
    await expect(login(ctx, [], opts)).rejects.toThrow('<tienda>')
  })
})

describe('library commands', () => {
  test('library filters installed games and --json prints the array', async () => {
    const games = [game(), game({ app_name: 'g2', is_installed: true })]
    const { ctx, calls, lines } = fakeCtx({ getLibrary: games }, [], true)

    await library(ctx, ['gog'], { ...opts, installed: true })

    expect(calls).toEqual([['getLibrary', ['gog']]])
    expect(JSON.parse(lines[0])).toEqual([games[1]])
  })

  test('refresh of one store waits for its event', async () => {
    const { ctx, calls, lines } = fakeCtx({}, [
      { event: 'refreshLibrary', args: ['nile'] },
      { event: 'refreshLibrary', args: ['gog'] }
    ])

    await refresh(ctx, ['gog'], opts)

    expect(calls).toEqual([['refreshLibrary', ['gog']]])
    expect(lines).toEqual(['GOG actualizada'])
  })

  test('refresh of all waits for the four stores', async () => {
    const { ctx, calls, lines } = fakeCtx(
      {},
      STORES.map((s) => ({ event: 'refreshLibrary', args: [s.id] }))
    )

    await refresh(ctx, [], opts)

    expect(calls).toEqual([['refreshLibrary', ['all']]])
    expect(lines).toHaveLength(4)
  })
})

describe('game commands', () => {
  test('platformFor follows the store naming', () => {
    expect(platformFor(game({ runner: 'gog' }))).toBe('windows')
    expect(platformFor(game({ runner: 'zoom' }))).toBe('windows')
    expect(platformFor(game({ runner: 'legendary' }))).toBe('Windows')
    expect(platformFor(game({ runner: 'nile' }))).toBe('Windows')
    expect(platformFor(game({ runner: 'gog', is_linux_native: true }))).toBe(
      'linux'
    )
  })

  test('install uses the default path and waits until done', async () => {
    const info = game()
    const { ctx, calls, lines } = fakeCtx(
      {
        getGameInfo: info,
        requestAppSettings: { defaultInstallPath: '/games' },
        getDMQueueInformation: { finished: [] }
      },
      [update1('queued'), update1('installing', 'other'), update1('done')]
    )

    await install(ctx, ['gog', 'g1'], opts)

    expect(calls[2]).toEqual([
      'install',
      [
        {
          appName: 'g1',
          runner: 'gog',
          gameInfo: info,
          path: '/games',
          platformToInstall: 'windows'
        }
      ]
    ])
    expect(lines).toEqual(['queued', 'done'])
  })

  test('install --path overrides the default', async () => {
    const { ctx, calls } = fakeCtx(
      {
        getGameInfo: game(),
        requestAppSettings: { defaultInstallPath: '/games' },
        getDMQueueInformation: { finished: [] }
      },
      [update1('done')]
    )

    await install(ctx, ['gog', 'g1'], { ...opts, path: '/mine' })

    expect(calls[2][1]).toMatchObject([{ path: '/mine' }])
  })

  test('install --lang sends the language, and without it sends none', async () => {
    const replies = {
      getGameInfo: game(),
      requestAppSettings: { defaultInstallPath: '/games' },
      getDMQueueInformation: { finished: [] }
    }
    const withLang = fakeCtx(replies, [update1('done')])
    await install(withLang.ctx, ['gog', 'g1'], { ...opts, lang: 'es-ES' })
    expect(withLang.calls[2][1]).toMatchObject([{ installLanguage: 'es-ES' }])

    const without = fakeCtx(replies, [update1('done')])
    await install(without.ctx, ['gog', 'g1'], opts)
    expect(without.calls[2][1]).toEqual([
      expect.not.objectContaining({ installLanguage: expect.any(String) })
    ])
  })

  test('install --skip-dlcs sends an empty list, and without it none', async () => {
    const replies = {
      getGameInfo: game(),
      requestAppSettings: { defaultInstallPath: '/games' },
      getDMQueueInformation: { finished: [] }
    }
    const skipping = fakeCtx(replies, [update1('done')])
    await install(skipping.ctx, ['gog', 'g1'], { ...opts, skipDlcs: true })
    expect(skipping.calls[2][1]).toMatchObject([{ installDlcs: [] }])

    const byDefault = fakeCtx(replies, [update1('done')])
    await install(byDefault.ctx, ['gog', 'g1'], opts)
    expect(
      (byDefault.calls[2][1] as { installDlcs?: string[] }[])[0].installDlcs
    ).toBeUndefined()
  })

  test('install of an unknown game fails before queueing', async () => {
    const { ctx, calls } = fakeCtx({ getGameInfo: null })

    await expect(install(ctx, ['gog', 'zz'], opts)).rejects.toThrow(/"zz"/)
    expect(calls.map(([channel]) => channel)).toEqual(['getGameInfo'])
  })

  test('a store that answers an empty game is an unknown game', async () => {
    const { ctx } = fakeCtx({ getGameInfo: game({ app_name: '' }) })

    await expect(install(ctx, ['gog', 'zz'], opts)).rejects.toThrow(/"zz"/)
  })

  test('done with a failed download in the queue still fails', async () => {
    const failed = (appName: string, status: string) => ({
      params: { appName },
      status
    })
    const { ctx } = fakeCtx(
      {
        getGameInfo: game(),
        requestAppSettings: { defaultInstallPath: '/g' },
        getDMQueueInformation: {
          finished: [failed('g1', 'done'), failed('g1', 'error')]
        }
      },
      [update1('installing'), update1('done')]
    )

    await expect(install(ctx, ['gog', 'g1'], opts)).rejects.toThrow(
      /ha fallado/
    )
  })

  test('the failure message says why when relicd knows', async () => {
    const { ctx } = fakeCtx(
      {
        getGameInfo: game(),
        requestAppSettings: { defaultInstallPath: '/g' },
        getDMQueueInformation: {
          finished: [
            {
              params: { appName: 'g1' },
              status: 'error',
              error: 'relicd has no screen'
            }
          ]
        }
      },
      [update1('installing'), update1('done')]
    )

    await expect(install(ctx, ['gog', 'g1'], opts)).rejects.toThrow(
      'La descarga ha fallado: relicd has no screen'
    )
  })

  test('an installed game is refused before asking relicd to install it', async () => {
    const { ctx, calls } = fakeCtx({
      getGameInfo: game({ is_installed: true }),
      requestAppSettings: { defaultInstallPath: '/g' }
    })

    await expect(install(ctx, ['gog', 'g1'], opts)).rejects.toThrow(
      'Game One ya está instalado: usa repair o update'
    )
    expect(calls.map(([channel]) => channel)).not.toContain('install')
  })

  test('a game that ends in error fails the command', async () => {
    const { ctx } = fakeCtx(
      { getGameInfo: game(), requestAppSettings: { defaultInstallPath: '/g' } },
      [update1('installing'), update1('error')]
    )

    await expect(install(ctx, ['gog', 'g1'], opts)).rejects.toThrow(/error/)
  })

  test('--no-wait queues and returns without events', async () => {
    const { ctx, lines } = fakeCtx({
      getGameInfo: game(),
      requestAppSettings: { defaultInstallPath: '/g' }
    })

    await install(ctx, ['gog', 'g1'], { ...opts, wait: false })

    expect(lines).toEqual([])
  })

  test('update sends the game and no path', async () => {
    const info = game()
    const { ctx, calls } = fakeCtx(
      { getGameInfo: info, getDMQueueInformation: { finished: [] } },
      [update1('done')]
    )

    await update(ctx, ['gog', 'g1'], opts)

    expect(calls[1]).toEqual([
      'updateGame',
      [{ appName: 'g1', runner: 'gog', gameInfo: info }]
    ])
  })

  test('repair and uninstall use the runner name', async () => {
    const repaired = fakeCtx({}, [update1('done')])
    await repair(repaired.ctx, ['amazon', 'g1'], opts)
    expect(repaired.calls).toEqual([['repair', ['g1', 'nile']]])

    const removed = fakeCtx({}, [update1('done')])
    await uninstall(removed.ctx, ['epic', 'g1'], opts)
    expect(removed.calls).toEqual([['uninstall', ['g1', 'legendary', true]]])
  })

  test('progress is printed once per whole percent', async () => {
    const progress = (percent: number) => ({
      event: 'progressUpdate',
      args: [
        {
          appName: 'g1',
          status: 'installing',
          progress: { percent, bytes: '1MB', eta: '' }
        }
      ]
    })
    const { ctx, lines } = fakeCtx({}, [])
    const events = (async function* () {
      yield progress(10.1)
      yield progress(10.7)
      yield progress(11)
      yield update1('done')
    })()

    await followGame(ctx, events, 'g1')

    expect(lines).toEqual(['10.1% 1MB', '11% 1MB', 'done'])
  })
})

describe('call command', () => {
  test('parseCallArgs', () => {
    expect(parseCallArgs(undefined)).toEqual([])
    expect(parseCallArgs('["gog", 1]')).toEqual(['gog', 1])
    expect(() => parseCallArgs('gog')).toThrow(/JSON/)
    expect(() => parseCallArgs('{"a":1}')).toThrow(/array/)
  })

  test('call prints the result as JSON', async () => {
    const { ctx, calls, lines } = fakeCtx({ getRelicVersion: '1.0' })

    await call(ctx, ['getRelicVersion'], opts)

    expect(calls).toEqual([['getRelicVersion', []]])
    expect(lines).toEqual(['"1.0"'])
  })
})

describe('stores of relicd', () => {
  test('an unknown store lists the names relicd reports', async () => {
    const { ctx } = fakeCtx()
    ctx.stores = () =>
      Promise.resolve([{ id: 'legendary', name: 'epic', label: 'Epic' }])

    await expect(login(ctx, ['steam'], opts)).rejects.toThrow(
      'Tienda desconocida "steam" (epic)'
    )
  })

  test('a store relicd added later works without changing relicctl', async () => {
    const { ctx, calls } = fakeCtx()
    ctx.stores = () =>
      Promise.resolve([{ id: 'itch' as never, name: 'itch', label: 'itch.io' }])

    await logout(ctx, ['itch'], opts)

    expect(calls).toEqual([['logout', ['itch']]])
  })
})

describe('cli', () => {
  test('parses options and positionals', () => {
    expect(
      parseCli(['install', 'gog', 'g1', '--path', '/x', '--no-wait', '--json'])
    ).toMatchObject({
      command: 'install',
      args: ['gog', 'g1'],
      opts: {
        path: '/x',
        lang: undefined,
        skipDlcs: undefined,
        wait: false,
        installed: false
      },
      json: true
    })
  })

  test('parses --skip-dlcs', () => {
    expect(
      parseCli(['install', 'gog', 'g1', '--skip-dlcs']).opts.skipDlcs
    ).toBe(true)
  })

  test('parses --lang', () => {
    expect(
      parseCli(['install', 'gog', 'g1', '--lang', 'es-ES']).opts.lang
    ).toBe('es-ES')
  })

  test('without a command it prints the help, with no API access', async () => {
    const lines: string[] = []
    await runCli([], {
      log: (l) => lines.push(l),
      ask: () => Promise.resolve('')
    })
    expect(lines[0]).toMatch(/^Uso: relicctl/)
  })

  test('an unknown command is an error', async () => {
    await expect(
      runCli(['dance'], {
        log: () => undefined,
        ask: () => Promise.resolve('')
      })
    ).rejects.toThrow(/Comando desconocido "dance"/)
  })
})

describe('config', () => {
  test('shows how many CPUs maxWorkers can use', async () => {
    const all = fakeCtx({
      requestAppSettings: { maxWorkers: 0 },
      getMaxCpus: 8
    })
    await config(all.ctx, [], opts)
    expect(all.lines[0]).toBe('maxWorkers = 0 (máx. 8)')
  })

  const settings = {
    defaultInstallPath: '/games',
    autoUpdateGames: true,
    maxWorkers: 0
  }

  test('lists, reads and saves a setting', async () => {
    const all = fakeCtx({ requestAppSettings: settings })
    await config(all.ctx, [], opts)
    expect(all.lines[0]).toContain('defaultInstallPath = /games')

    const one = fakeCtx({ requestAppSettings: settings })
    await config(one.ctx, ['defaultInstallPath'], opts)
    expect(one.lines).toEqual(['/games'])

    const set = fakeCtx({ requestAppSettings: settings })
    await config(set.ctx, ['defaultInstallPath', '/mnt/sd'], opts)
    expect(set.calls[1]).toEqual([
      'setSetting',
      [{ key: 'defaultInstallPath', value: '/mnt/sd' }]
    ])
  })

  test('refuses unknown keys and values of the wrong type', async () => {
    expect(() => settingKey(settings as never, 'nope')).toThrow(CliError)
    expect(parseValue(true, 'false')).toBe(false)
    expect(parseValue(0, '4')).toBe(4)
    expect(() => parseValue(true, 'si')).toThrow(CliError)
    expect(() => parseValue(0, 'x')).toThrow(CliError)
  })
})

describe('logs', () => {
  test('asks for relicd, a store or one game', async () => {
    const { ctx, calls, lines } = fakeCtx({ getLogContent: 'hola\n' })
    await logs(ctx, [], opts)
    await logs(ctx, ['epic'], opts)
    await logs(ctx, ['gog', 'g1'], { ...opts, type: 'install' })
    expect(calls.map(([, args]) => args[0])).toEqual([
      {},
      { runner: 'legendary' },
      { runner: 'gog', appName: 'g1', type: 'install' }
    ])
    expect(lines[0]).toBe('hola')
  })

  test('says so when there is no log', async () => {
    const { ctx, lines } = fakeCtx({ getLogContent: '' })
    await logs(ctx, [], opts)
    expect(lines).toEqual(['No hay registro'])
  })
})

describe('queue control', () => {
  test('pause, resume, cancel and clear call their channel', async () => {
    const { ctx, calls } = fakeCtx()
    await pause(ctx, [], opts)
    await resume(ctx, [], opts)
    await cancel(ctx, [], { ...opts, removeFiles: true })
    await queue(ctx, ['clear'], opts)
    expect(calls).toEqual([
      ['pauseCurrentDownload', []],
      ['resumeCurrentDownload', []],
      ['cancelDownload', [true]],
      ['clearFinishedDMQueue', []]
    ])
  })
})

describe('maintenance', () => {
  test('cache clear sends the store, or nothing for all', async () => {
    const { ctx, calls } = fakeCtx()
    await cache(ctx, ['clear'], opts)
    await cache(ctx, ['clear', 'epic'], opts)
    expect(calls).toEqual([
      ['clearCache', []],
      ['clearCache', ['legendary']]
    ])
    await expect(cache(ctx, [], opts)).rejects.toThrow(CliError)
  })

  test('reset asks first and --yes skips the question', async () => {
    const no = fakeCtx()
    no.ctx.ask = () => Promise.resolve('n')
    await reset(no.ctx, [], opts)
    expect(no.calls).toEqual([])

    const yes = fakeCtx()
    yes.ctx.ask = () => Promise.resolve('s')
    await reset(yes.ctx, [], opts)
    const forced = fakeCtx()
    await reset(forced.ctx, [], { ...opts, yes: true })
    expect(yes.calls).toEqual([['resetRelic', []]])
    expect(forced.calls).toEqual([['resetRelic', []]])
  })
})
