import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import type { LoginReply, SettingReply } from '../api/bridge'
import type {
  AccountsStatus,
  AppSettings,
  FolderListing,
  QueueInfo,
  StoreInfo
} from '../api/types'
import App from '../App'
import { emptyQueue, fakeRelicd, game, settings } from './fakeRelicd'

const stores: StoreInfo[] = [
  { id: 'legendary', name: 'epic', label: 'Epic' },
  { id: 'gog', name: 'gog', label: 'GOG' }
]
const signedIn = {
  legendary: { loggedIn: true, name: 'Ana' },
  gog: { loggedIn: false },
  nile: { loggedIn: false },
  zoom: { loggedIn: false }
} as AccountsStatus
const library = [
  game('alpha', { title: 'Alpha', runner: 'gog' }),
  game('beta', {
    title: 'Beta',
    runner: 'gog',
    is_installed: true,
    install: { install_path: '/g/beta', version: '1.2' }
  }),
  game('gamma', { title: 'Gamma', runner: 'legendary' })
]

function setup(
  options: {
    settings?: Partial<AppSettings>
    setting?: SettingReply
    folders?: (path?: string) => FolderListing
    queue?: QueueInfo
    updates?: string[]
    accounts?: AccountsStatus
    login?: LoginReply
  } = {}
) {
  const relicd = fakeRelicd(
    {
      getStores: stores,
      getLibrary: (runner) => library.filter((g) => g.runner === runner),
      checkGameUpdates: options.updates ?? [],
      requestAppSettings: settings(options.settings),
      getDMQueueInformation: options.queue ?? emptyQueue,
      getAccounts: options.accounts ?? signedIn,
      listFolders:
        options.folders ??
        ((path) => ({ path: path ?? '/home/deck', parent: null, folders: [] }))
    },
    {
      login: options.login,
      setting: options.setting
    }
  )
  window.relicd = relicd.bridge
  render(<App />)
  return relicd
}

const press = (key: string) =>
  act(() => void fireEvent.keyDown(window, { key }))
const focusTitle = () => document.querySelector('.focusTitle')?.textContent

beforeEach(() => {
  Element.prototype.scrollIntoView = jest.fn()
  Object.defineProperty(navigator, 'getGamepads', {
    value: () => [],
    configurable: true
  })
})
afterEach(cleanup)

describe('library', () => {
  test('lists the games, sorted, with the stores that have games', async () => {
    setup()
    await screen.findByTitle('Alpha')

    const titles = Array.from(document.querySelectorAll('.card')).map((c) =>
      c.getAttribute('title')
    )
    expect(titles).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Epic' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'GOG' })).toBeTruthy()
  })

  test('is in English whatever language relicd downloads in', async () => {
    setup({ settings: { language: 'es' } })
    await screen.findByTitle('Alpha')
    expect(screen.getByRole('button', { name: 'Installed' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy()
  })

  test('arrows move the focus; the title above follows it', async () => {
    setup()
    await screen.findByTitle('Alpha')
    expect(focusTitle()).toBe('Alpha')

    press('ArrowRight')
    expect(focusTitle()).toBe('Beta')
    press('ArrowLeft')
    expect(focusTitle()).toBe('Alpha')
  })

  test('the store keys and the installed key filter the grid', async () => {
    setup()
    await screen.findByTitle('Alpha')

    press(']')
    expect(
      Array.from(document.querySelectorAll('.card')).map((c) =>
        c.getAttribute('title')
      )
    ).toEqual(['Gamma'])
    press('[')
    press('i')
    expect(
      Array.from(document.querySelectorAll('.card')).map((c) =>
        c.getAttribute('title')
      )
    ).toEqual(['Beta'])
  })

  test('a game with an update shows the mark', async () => {
    setup({ updates: ['beta'] })
    await screen.findByTitle('Beta')
    expect(document.querySelectorAll('.badge.update')).toHaveLength(1)
  })
})

describe('game sheet', () => {
  test('a game not installed offers to install it, into the default folder', async () => {
    const relicd = setup()
    await screen.findByTitle('Alpha')

    press('Enter')
    expect(screen.getByText('It will be installed in /juegos')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))

    await waitFor(() => expect(relicd.called('install')).toHaveLength(1))
    expect(relicd.called('install')[0][1][0]).toMatchObject({
      appName: 'alpha',
      runner: 'gog',
      path: '/juegos',
      platformToInstall: 'windows'
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('an installed game offers repair and uninstall, not install', async () => {
    setup()
    await screen.findByTitle('Beta')
    press('ArrowRight')
    press('Enter')

    expect(screen.getByRole('button', { name: 'Repair' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Uninstall' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
    expect(screen.getByText('Installed in /g/beta')).toBeTruthy()
  })

  test('uninstalling asks first and starts on «no»', async () => {
    const relicd = setup()
    await screen.findByTitle('Beta')
    press('ArrowRight')
    press('Enter')
    press('ArrowDown') // repair -> uninstall
    press('Enter')

    expect(screen.getByText('Uninstall Beta?')).toBeTruthy()
    press('Enter') // «no» is the one focused
    expect(relicd.called('uninstall')).toHaveLength(0)

    press('Enter') // back in the sheet, on «uninstall»
    press('ArrowLeft') // -> «yes»
    press('Enter')
    await waitFor(() => expect(relicd.called('uninstall')).toHaveLength(1))
    expect(relicd.called('uninstall')[0][1]).toEqual(['beta', 'gog', true])
  })

  test('escape closes the sheet', async () => {
    setup()
    await screen.findByTitle('Alpha')
    press('Enter')
    expect(screen.getByRole('dialog')).toBeTruthy()
    press('Escape')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('a game being installed shows its progress and can be cancelled, not installed again', async () => {
    const relicd = setup()
    await screen.findByTitle('Alpha')

    act(() =>
      relicd.emit({
        event: 'progressUpdate',
        args: [
          {
            appName: 'alpha',
            status: 'installing',
            progress: { bytes: '10MB', eta: '00:01', percent: 40 }
          }
        ]
      })
    )
    expect(screen.getByText('Installing')).toBeTruthy()

    press('Enter')
    expect(screen.getByRole('button', { name: 'Cancel download' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
  })
})

describe('downloads', () => {
  const queue: QueueInfo = {
    state: 'running',
    elements: [
      {
        type: 'install',
        params: {
          appName: 'alpha',
          runner: 'gog',
          path: '/juegos',
          gameInfo: library[0]
        },
        addToQueueTime: 0,
        startTime: 0,
        endTime: 0
      }
    ],
    finished: [
      {
        type: 'install',
        params: {
          appName: 'beta',
          runner: 'gog',
          path: '/juegos',
          gameInfo: library[1]
        },
        addToQueueTime: 0,
        startTime: 0,
        endTime: 1,
        status: 'error',
        error: 'relicd has no screen'
      }
    ]
  }

  test('the panel lists the queue, the finished ones and why one failed', async () => {
    setup({ queue })
    await screen.findByTitle('Alpha')

    press('d')
    expect(screen.getByRole('heading', { name: /Downloads/ })).toBeTruthy()
    expect(screen.getByText('Failed: relicd has no screen')).toBeTruthy()
    expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0)
  })

  test('pause asks relicd to pause; escape closes the panel', async () => {
    const relicd = setup({ queue })
    await screen.findByTitle('Alpha')

    press('d')
    press('Enter') // first control: pause
    await waitFor(() =>
      expect(relicd.called('pauseCurrentDownload')).toHaveLength(1)
    )
    press('Escape')
    expect(screen.queryByRole('heading', { name: /Downloads/ })).toBeNull()
  })
})

describe('connection', () => {
  test('while relicd does not answer the app is covered, and it reads everything again on return', async () => {
    const relicd = setup()
    await screen.findByTitle('Alpha')
    const loads = relicd.called('getLibrary').length

    act(() => relicd.setConnection('offline'))
    expect(screen.getByText('relicd is not answering')).toBeTruthy()
    expect(screen.getByText(/relicctl start/)).toBeTruthy()

    act(() => relicd.setConnection('online'))
    await waitFor(() =>
      expect(screen.queryByText('relicd is not answering')).toBeNull()
    )
    await waitFor(() =>
      expect(relicd.called('getLibrary').length).toBeGreaterThan(loads)
    )
  })

  test('a problem relicd reports shows as a notice that any answer closes', async () => {
    const relicd = setup()
    await screen.findByTitle('Alpha')

    act(() =>
      relicd.emit({
        event: 'showDialog',
        args: ['Warning', 'Epic is down', 'ERROR']
      })
    )
    expect(screen.getByText('Epic is down')).toBeTruthy()
    press('Enter')
    expect(screen.queryByText('Epic is down')).toBeNull()
  })
})

describe('loading', () => {
  const answers = (overrides: Parameters<typeof fakeRelicd>[0]) =>
    fakeRelicd({
      getStores: stores,
      requestAppSettings: settings(),
      getDMQueueInformation: emptyQueue,
      checkGameUpdates: [],
      ...overrides
    })

  test('the games show without waiting for the update check, which comes later', async () => {
    let finishUpdates: (updates: string[]) => void = () => undefined
    const relicd = answers({
      getLibrary: (runner) => library.filter((g) => g.runner === runner),
      checkGameUpdates: (() =>
        new Promise<string[]>((resolve) => (finishUpdates = resolve))) as never
    })
    window.relicd = relicd.bridge
    render(<App />)

    await screen.findByTitle('Alpha')
    expect(document.querySelectorAll('.badge.update')).toHaveLength(0)

    act(() => finishUpdates(['beta']))
    await waitFor(() =>
      expect(document.querySelectorAll('.badge.update')).toHaveLength(1)
    )
  })

  test('each store shows as it arrives, the slow one does not hold the others', async () => {
    let finishEpic: (games: typeof library) => void = () => undefined
    const relicd = answers({
      getLibrary: ((runner: string) =>
        runner === 'legendary'
          ? new Promise((resolve) => (finishEpic = resolve))
          : library.filter((g) => g.runner === runner)) as never
    })
    window.relicd = relicd.bridge
    render(<App />)

    await screen.findByTitle('Alpha')
    expect(screen.queryByTitle('Gamma')).toBeNull()
    // Epic is still being read: its tab is there, marked
    expect(screen.getByRole('button', { name: 'Epic …' })).toBeTruthy()

    act(() => finishEpic(library.filter((g) => g.runner === 'legendary')))
    await screen.findByTitle('Gamma')
    expect(screen.getByRole('button', { name: 'Epic' })).toBeTruthy()
  })

  test('a store that fails is reported and the others still show', async () => {
    const relicd = answers({
      getLibrary: ((runner: string) =>
        runner === 'legendary'
          ? Promise.reject(new Error('epic broke'))
          : library.filter((g) => g.runner === runner)) as never
    })
    window.relicd = relicd.bridge
    render(<App />)

    await screen.findByTitle('Alpha')
    await screen.findByText('epic broke')
    expect(screen.queryByTitle('Gamma')).toBeNull()
  })

  test('the update check also runs after a library refresh', async () => {
    const relicd = answers({
      getLibrary: (runner) => library.filter((g) => g.runner === runner)
    })
    window.relicd = relicd.bridge
    render(<App />)
    await screen.findByTitle('Alpha')
    await waitFor(() =>
      expect(relicd.called('checkGameUpdates')).toHaveLength(1)
    )

    act(() => relicd.emit({ event: 'refreshLibrary', args: ['gog'] }))
    await waitFor(() =>
      expect(relicd.called('checkGameUpdates')).toHaveLength(2)
    )
  })
})

describe('covers', () => {
  const withArt = [
    game('alpha', {
      title: 'Alpha',
      art_square: 'https://cdn/tall.jpg',
      art_cover: 'https://cdn/wide.jpg'
    })
  ]

  test('the card shows the tall box art, and the banner only if that one fails', async () => {
    const relicd = fakeRelicd({
      getStores: stores,
      getLibrary: (runner) => withArt.filter((g) => g.runner === runner),
      checkGameUpdates: [],
      requestAppSettings: settings(),
      getDMQueueInformation: emptyQueue
    })
    window.relicd = relicd.bridge
    render(<App />)
    await screen.findByTitle('Alpha')

    const image = () => document.querySelector('.card img') as HTMLImageElement
    expect(image().src).toBe('https://cdn/tall.jpg')

    fireEvent.error(image())
    expect(image().src).toBe('https://cdn/wide.jpg')

    fireEvent.error(image())
    expect(document.querySelector('.card img')).toBeNull()
    expect(document.querySelector('.card .noImage')?.textContent).toBe('Alpha')
  })
})

describe('covers load when they get near the visible area', () => {
  test('no picture is requested until the grid says the card is near; then it stays', async () => {
    const observers: {
      callback: IntersectionObserverCallback
      target?: Element
    }[] = []
    class FakeObserver {
      private entry: {
        callback: IntersectionObserverCallback
        target?: Element
      }
      constructor(callback: IntersectionObserverCallback) {
        this.entry = { callback }
        observers.push(this.entry)
      }
      observe(target: Element) {
        this.entry.target = target
      }
      disconnect() {}
      unobserve() {}
    }
    const original = window.IntersectionObserver
    window.IntersectionObserver = FakeObserver as never
    try {
      const relicd = fakeRelicd({
        getStores: stores,
        getLibrary: (runner) =>
          [
            game('alpha', { title: 'Alpha', art_square: 'https://cdn/a.jpg' })
          ].filter((g) => g.runner === runner),
        checkGameUpdates: [],
        requestAppSettings: settings(),
        getDMQueueInformation: emptyQueue
      })
      window.relicd = relicd.bridge
      render(<App />)
      await screen.findByTitle('Alpha')
      await waitFor(() => expect(observers.length).toBeGreaterThan(0))
      expect(document.querySelector('.card img')).toBeNull()

      act(() =>
        observers.forEach(({ callback }) =>
          callback(
            [{ isIntersecting: true }] as IntersectionObserverEntry[],
            {} as IntersectionObserver
          )
        )
      )
      expect(
        (document.querySelector('.card img') as HTMLImageElement).src
      ).toBe('https://cdn/a.jpg')
    } finally {
      window.IntersectionObserver = original
    }
  })
})

describe('menu and accounts', () => {
  const openAccounts = async () => {
    const relicd = setup()
    await screen.findByTitle('Alpha')
    press('m')
    expect(screen.getByRole('heading', { name: 'Menu' })).toBeTruthy()
    press('Enter')
    await screen.findByText('Signed in as Ana')
    return relicd
  }

  test('Select opens the menu, and back closes it', async () => {
    setup()
    await screen.findByTitle('Alpha')
    press('m')
    expect(screen.getByRole('button', { name: 'Accounts' })).toBeTruthy()
    press('Escape')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('lists each store with its state', async () => {
    await openAccounts()
    // the five entries of the menu plus the two stores
    expect(document.querySelectorAll('.rows .row')).toHaveLength(7)
    expect(screen.getByText('Signed in as Ana')).toBeTruthy()
    expect(screen.getByText('Not signed in')).toBeTruthy()
  })

  test('signing out asks first (on «no») and then reloads that store', async () => {
    const relicd = await openAccounts()
    press('Enter') // Epic is signed in
    expect(screen.getByText('Sign out of Epic?')).toBeTruthy()
    press('Enter') // «no»
    expect(relicd.calls.some(([c]) => c === 'logout')).toBe(false)

    press('Enter')
    press('ArrowLeft')
    press('Enter')
    await waitFor(() =>
      expect(relicd.calls).toContainEqual(['logout', ['legendary']])
    )
    await waitFor(() =>
      expect(
        relicd.calls.filter(
          ([c, a]) => c === 'getLibrary' && a[0] === 'legendary'
        ).length
      ).toBeGreaterThan(1)
    )
  })
})

describe('settings in the menu', () => {
  let current: AppSettings
  const open = async (options: Parameters<typeof setup>[0] = {}, entry = 0) => {
    current = settings({
      protonPath: '/p/GE-Proton',
      steamGridDbApiKey: 'secret',
      ...options?.settings
    })
    const relicd = setup({
      ...options,
      settings: current
    })
    await screen.findByTitle('Alpha')
    press('m')
    for (let i = 0; i < entry; i++) press('ArrowDown')
    return relicd
  }

  test('shows each setting next to its entry, never the key itself', async () => {
    await open()
    await screen.findByText('/juegos')
    expect(screen.getByText('/p/GE-Proton')).toBeTruthy()
    expect(screen.getByText('Set')).toBeTruthy()
    expect(screen.queryByText('secret')).toBeNull()
    expect(screen.getByText('Spanish (es)')).toBeTruthy()
  })

  test('the download folder is picked by walking the folders', async () => {
    const relicd = await open(
      {
        folders: (path) => ({
          path: path ?? '/home/deck',
          parent: path === '/juegos' ? '/' : path ? '/juegos' : null,
          folders: path === '/juegos' ? ['rpg', 'misc'] : []
        })
      },
      1
    )
    press('Enter')
    await screen.findByText('Use this folder')
    expect(relicd.calls).toContainEqual(['listFolders', ['/juegos']])

    press('ArrowDown') // Up
    press('ArrowDown') // rpg
    press('Enter')
    await waitFor(() =>
      expect(relicd.calls).toContainEqual(['listFolders', ['/juegos/rpg']])
    )
    press('Enter') // Use this folder
    await waitFor(() =>
      expect(relicd.setSetting).toHaveBeenCalledWith(
        'defaultInstallPath',
        '/juegos/rpg'
      )
    )
  })

  test('relicd refusing the Proton folder shows why and keeps the picker open', async () => {
    await open({ setting: { ok: false, error: 'not a Proton folder' } }, 2)
    press('Enter')
    await screen.findByText('Use this folder')
    press('Enter')
    await screen.findByText('Could not save: not a Proton folder')
    expect(screen.getByText('Use this folder')).toBeTruthy()
  })

  test('«Automatic» saves an empty Proton folder', async () => {
    const relicd = await open({}, 2)
    press('Enter')
    await screen.findByText('Automatic (first GE-Proton found)')
    press('ArrowDown')
    press('Enter')
    await waitFor(() =>
      expect(relicd.setSetting).toHaveBeenCalledWith('protonPath', '')
    )
  })

  test('the key is typed in a field without the letters acting as shortcuts', async () => {
    const relicd = await open({}, 3)
    press('Enter')
    const field = await screen.findByRole<HTMLInputElement>('textbox')
    fireEvent.change(field, { target: { value: 'qid' } })
    fireEvent.keyDown(field, { key: 'q' })
    fireEvent.keyDown(field, { key: 'i' })
    expect(screen.getByRole('textbox')).toBeTruthy()

    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() =>
      expect(relicd.setSetting).toHaveBeenCalledWith('steamGridDbApiKey', 'qid')
    )
  })

  test('the language goes through the list and saves on A; B cancels', async () => {
    const relicd = await open({}, 4)
    press('Enter')
    await screen.findByText('Spanish (es)', { selector: 'strong' })
    press('ArrowRight')
    expect(
      screen.getByText('Estonian (et)', { selector: 'strong' })
    ).toBeTruthy()
    press('Escape')
    expect(relicd.setSetting).not.toHaveBeenCalled()

    press('Enter')
    press('ArrowRight')
    press('Enter')
    await waitFor(() =>
      expect(relicd.setSetting).toHaveBeenCalledWith('language', 'et')
    )
  })
})

describe('login', () => {
  const openLogin = async (options: Parameters<typeof setup>[0] = {}) => {
    const relicd = setup(options)
    await screen.findByTitle('Alpha')
    press('m')
    press('Enter')
    await screen.findByText('Signed in as Ana')
    press('ArrowDown') // GOG, signed out
    press('Enter')
    return relicd
  }

  test('open the page, paste where it ends, and it is done', async () => {
    const relicd = await openLogin()

    const link = await screen.findByRole('link', {
      name: 'Open the login page'
    })
    expect(link.getAttribute('href')).toBe('https://login.example/gog')
    expect(screen.getByText('Log in to GOG.')).toBeTruthy()

    const field = await screen.findByRole<HTMLInputElement>('textbox')
    fireEvent.change(field, { target: { value: 'https://end?code=1' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() =>
      expect(relicd.login.submit).toHaveBeenCalledWith(
        'gog',
        'https://end?code=1'
      )
    )
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
  })

  test('a login that relicd refuses says why and stays open', async () => {
    await openLogin({ login: { ok: false, error: 'No login code found' } })
    const field = await screen.findByRole<HTMLInputElement>('textbox')
    fireEvent.keyDown(field, { key: 'Enter' })
    await screen.findByText('Could not sign in: No login code found')
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  test('the button reads the clipboard, fills the field and signs in', async () => {
    Object.assign(navigator, {
      clipboard: {
        readText: jest.fn().mockResolvedValue(' https://end?code=2 ')
      }
    })
    const relicd = await openLogin()
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Paste from clipboard and sign in'
      })
    )
    await waitFor(() =>
      expect(relicd.login.submit).toHaveBeenCalledWith(
        'gog',
        'https://end?code=2'
      )
    )
  })

  test('a clipboard that cannot be read says so and sends nothing', async () => {
    Object.assign(navigator, {
      clipboard: { readText: jest.fn().mockRejectedValue(new Error('denied')) }
    })
    const relicd = await openLogin()
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Paste from clipboard and sign in'
      })
    )
    await screen.findByText(/Could not read the clipboard/)
    expect(relicd.login.submit).not.toHaveBeenCalled()
  })
})

describe('closing the panels with the mouse', () => {
  test('every panel has a button to close it', async () => {
    setup()
    await screen.findByTitle('Alpha')
    press('m')
    fireEvent.click(await screen.findByRole('button', { name: '✕ Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('without relicd', () => {
  test('it says how to start it, and there is no button to do it', async () => {
    const relicd = setup()
    await screen.findByTitle('Alpha')
    act(() => relicd.setConnection('offline'))
    await screen.findByText(/Start it again with relicctl start/)
    expect(screen.queryByRole('button', { name: /Start/ })).toBeNull()
  })
})

describe('the web open to the network', () => {
  const setMode = (mode: string) => {
    const meta = document.createElement('meta')
    meta.name = 'relicd-web'
    meta.content = mode
    document.head.appendChild(meta)
    return () => meta.remove()
  }

  test('says it has no protection', async () => {
    const remove = setMode('network')
    setup()
    await screen.findByTitle('Alpha')
    expect(screen.getByRole('note').textContent).toContain('no protection')
    remove()
  })

  test('says nothing when it is only for this machine', async () => {
    const remove = setMode('local')
    setup()
    await screen.findByTitle('Alpha')
    expect(screen.queryByRole('note')).toBeNull()
    remove()
  })
})
