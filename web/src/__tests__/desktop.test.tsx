import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import type { QueueInfo, StoreInfo } from '../api/types'
import App from '../App'
import { emptyQueue, fakeRakun, game, settings } from './fakeRakun'

/** The page run by a desktop app (Relic): it can quit, start rakun and log in in a window */

const stores: StoreInfo[] = [
  { id: 'legendary', name: 'epic', label: 'Epic' },
  { id: 'gog', name: 'gog', label: 'GOG' }
]
const accounts = {
  legendary: { loggedIn: true, name: 'Ana' },
  gog: { loggedIn: false },
  nile: { loggedIn: false },
  zoom: { loggedIn: false }
}
const library = [
  game('alpha', { title: 'Alpha', runner: 'gog' }),
  game('gamma', { title: 'Gamma', runner: 'legendary' })
]
const queue: QueueInfo = {
  state: 'running',
  elements: [
    {
      type: 'install',
      params: {
        appName: 'alpha',
        runner: 'gog',
        path: '/j',
        gameInfo: library[0]
      },
      addToQueueTime: 0,
      startTime: 0,
      endTime: 0
    }
  ],
  finished: []
}

const boot = (
  options: Parameters<typeof fakeRakun>[1] = { desktop: {} },
  withQueue: QueueInfo = emptyQueue
) => {
  const rakun = fakeRakun(
    {
      getStores: stores,
      getLibrary: (runner) => library.filter((g) => g.runner === runner),
      checkGameUpdates: [],
      requestAppSettings: settings(),
      getDMQueueInformation: withQueue,
      getAccounts: accounts
    },
    options
  )
  window.rakun = rakun.bridge
  render(<App />)
  return rakun
}

const press = (key: string) =>
  act(() => void fireEvent.keyDown(window, { key }))

beforeEach(() => {
  Element.prototype.scrollIntoView = jest.fn()
  Object.defineProperty(navigator, 'getGamepads', {
    value: () => [],
    configurable: true
  })
})
afterEach(cleanup)

describe('the header names the app', () => {
  test('a desktop app shows its name next to the icon, and a Quit button', async () => {
    boot({ desktop: { appName: 'Relic' } })
    await screen.findByTitle('Alpha')
    const icon = screen.getByRole('img', { name: 'Relic' })
    expect(icon.nextElementSibling?.textContent).toBe('Relic')
    expect(screen.getByRole('button', { name: 'Quit' })).toBeTruthy()
    expect(document.querySelector('.wordmark')).toBeNull()
  })

  test("the web has rakun's own lettering, no Quit and no quit hint", async () => {
    boot({})
    await screen.findByTitle('Alpha')
    expect(screen.getByRole('img', { name: 'rakun' })).toBeTruthy()
    expect(document.querySelector('.wordmark')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Quit' })).toBeNull()
    expect(document.querySelector('.hints')?.textContent).not.toContain('Quit')
  })

  test('on the web, back on the grid asks nothing', async () => {
    boot({})
    await screen.findByTitle('Alpha')
    press('Escape')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('quitting', () => {
  test('back on the grid asks first, starting on «no»; yes quits', async () => {
    const rakun = boot({ desktop: { appName: 'Relic' } })
    await screen.findByTitle('Alpha')

    press('Escape')
    expect(screen.getByText('Quit Relic?')).toBeTruthy()
    press('Enter') // «no»
    expect(screen.queryByText('Quit Relic?')).toBeNull()
    expect(rakun.quit).not.toHaveBeenCalled()

    press('q')
    press('ArrowLeft') // -> «yes»
    press('Enter')
    expect(rakun.quit).toHaveBeenCalledTimes(1)
  })

  test('back inside a sheet only closes the sheet', async () => {
    const rakun = boot({ desktop: {} })
    await screen.findByTitle('Alpha')
    press('Enter')
    press('Escape')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText(/Quit .*\?/)).toBeNull()
    expect(rakun.quit).not.toHaveBeenCalled()
  })
})

describe('what quitting does to rakun', () => {
  const askToQuit = async (
    owns: 'none' | 'cli' | 'embedded',
    withQueue: QueueInfo
  ) => {
    boot({ desktop: { appName: 'Relic', owns } }, withQueue)
    await screen.findByTitle('Alpha')
    press('Escape')
  }

  test('a rakun that was already running stays running', async () => {
    await askToQuit('none', emptyQueue)
    await screen.findByText('rakun will keep running.')
  })

  test('the one the client started closes with it, if it is free', async () => {
    await askToQuit('cli', emptyQueue)
    await screen.findByText('rakun will close too: this client started it.')
  })

  test('but not while it is downloading', async () => {
    await askToQuit('cli', queue)
    await screen.findByText(
      'rakun will keep running because it is downloading.'
    )
  })

  test('the rakun inside the app stops with it, and says the downloads stop too', async () => {
    await askToQuit('embedded', queue)
    await screen.findByText(
      'Downloads in progress will stop: rakun runs inside Relic.'
    )
  })
})

describe('starting rakun', () => {
  test('when rakun does not answer there is a button to start it, already focused', async () => {
    const rakun = boot()
    await screen.findByTitle('Alpha')
    act(() => rakun.setConnection('offline'))

    expect(screen.getByRole('button', { name: 'Start rakun' })).toBeTruthy()
    press('Enter')
    await waitFor(() => expect(rakun.start).toHaveBeenCalledTimes(1))
  })

  test('shows that it is starting, and does not start twice', async () => {
    let finish: (reply: { ok: true }) => void = () => undefined
    const rakun = boot()
    rakun.start.mockImplementation(
      () => new Promise((resolve) => (finish = resolve))
    )
    await screen.findByTitle('Alpha')
    act(() => rakun.setConnection('offline'))

    press('Enter')
    press('Enter')
    expect(screen.getByRole('button', { name: 'Starting rakun…' })).toBeTruthy()
    expect(rakun.start).toHaveBeenCalledTimes(1)

    act(() => finish({ ok: true }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Start rakun' })).toBeTruthy()
    )
  })

  test('a failure says why', async () => {
    const rakun = boot({
      desktop: { start: { ok: false, error: 'rakunctl not found' } }
    })
    await screen.findByTitle('Alpha')
    act(() => rakun.setConnection('offline'))

    press('Enter')
    await screen.findByText('Could not start rakun: rakunctl not found')
  })

  test('while only connecting there is no button', async () => {
    const rakun = boot()
    await screen.findByTitle('Alpha')
    act(() => rakun.setConnection('connecting'))
    expect(screen.queryByRole('button', { name: 'Start rakun' })).toBeNull()
  })
})

describe('login in a window', () => {
  const openAccounts = async (options: Parameters<typeof boot>[0]) => {
    const rakun = boot(options)
    await screen.findByTitle('Alpha')
    press('m')
    press('Enter')
    await screen.findByText('Signed in as Ana')
    return rakun
  }

  test('A on a store without session starts its login and reads the accounts again', async () => {
    const rakun = await openAccounts({ desktop: {} })
    press('ArrowDown')
    press('Enter')
    await waitFor(() => expect(rakun.windowLogin).toHaveBeenCalledWith('gog'))
    await waitFor(() =>
      expect(rakun.called('getAccounts').length).toBeGreaterThan(1)
    )
    // No pasting: the host does the whole login
    expect(screen.queryByRole('link')).toBeNull()
  })

  test('a failed login says why', async () => {
    await openAccounts({
      desktop: { windowLogin: { ok: false, error: 'The store rejected it' } }
    })
    press('ArrowDown')
    press('Enter')
    await screen.findByText('Could not sign in: The store rejected it')
  })

  test('closing the window says nothing', async () => {
    await openAccounts({
      desktop: {
        windowLogin: { ok: false, error: 'cancelled', cancelled: true }
      }
    })
    press('ArrowDown')
    press('Enter')
    await waitFor(() =>
      expect(screen.queryByText(/Could not sign in/)).toBeNull()
    )
    expect(screen.queryByText('Waiting for the login…')).toBeNull()
  })
})
