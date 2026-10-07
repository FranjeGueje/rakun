import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameInfo, Runner } from '../api/types'
import type { Translate } from '../i18n'
import type { ControllerLayout } from '../input/controller'
import { useLayer } from '../input/useInput'
import type { State } from '../state/reducer'
import {
  cycle,
  moveInGrid,
  storeTabs,
  visibleGames,
  type Filters,
  type StoreTab
} from '../state/selectors'
import type { Actions } from '../state/useRakun'
import { Card } from './Card'
import { ScrollRoot } from './Cover'
import { Downloads } from './Downloads'
import { GameSheet } from './GameSheet'
import { Hints } from './Hints'
import { Menu } from './Menu'
import { useColumns } from './useColumns'

type Props = {
  state: State
  actions: Actions
  t: Translate
  layout: ControllerLayout | null
}

/** The label of a store tab, with «…» while its games are still being read */
function tabLabel(tabs: StoreTab[], id: Runner): string {
  const tab = tabs.find((candidate) => candidate.store.id === id)
  return tab ? `${tab.store.label}${tab.loading ? ' …' : ''}` : id
}

/** The only screen: the library as a grid of covers, with the filters on top */
export function Console({ state, actions, t, layout }: Props) {
  const [filters, setFilters] = useState<Filters>({
    store: 'all',
    installedOnly: false,
    ascending: true
  })
  const [focused, setFocused] = useState(0)
  const [openGame, setOpenGame] = useState<GameInfo | null>(null)
  const [downloadsOpen, setDownloadsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // On a narrow window the bar shows the stores only; the rest hides behind the ☰
  const [barOpen, setBarOpen] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState<HTMLElement | null>(null)

  const tabs = useMemo(
    () => storeTabs(state.games, state.stores, state.libraryLoaded),
    [state.games, state.stores, state.libraryLoaded]
  )
  const storeOptions = useMemo<(Runner | 'all')[]>(
    () => ['all', ...tabs.map((tab) => tab.store.id)],
    [tabs]
  )
  const games = useMemo(
    () => visibleGames(state.games, filters),
    [state.games, filters]
  )
  const columns = useColumns(gridRef, games.length)
  const index = Math.min(focused, Math.max(0, games.length - 1))

  useEffect(() => {
    if (!storeOptions.includes(filters.store))
      setFilters((current) => ({ ...current, store: 'all' }))
  }, [storeOptions, filters.store])

  useEffect(() => {
    gridRef.current?.children[index]?.scrollIntoView({ block: 'nearest' })
  }, [index, games.length])

  // The cards are memoised: these handlers must not change with every render
  const gamesRef = useRef(games)
  gamesRef.current = games
  const select = useCallback((i: number) => setFocused(i), [])
  const open = useCallback((i: number) => {
    const game = gamesRef.current[i]
    if (game) setOpenGame(game)
  }, [])

  const change = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }))
    setFocused(0)
  }

  useLayer((action) => {
    if (action === 'confirm') {
      if (games[index]) setOpenGame(games[index])
    } else if (
      action === 'up' ||
      action === 'down' ||
      action === 'left' ||
      action === 'right'
    ) {
      setFocused(moveInGrid(index, action, columns, games.length).index)
    } else if (action === 'prevStore')
      change({ store: cycle(storeOptions, filters.store, -1) })
    else if (action === 'nextStore')
      change({ store: cycle(storeOptions, filters.store, 1) })
    else if (action === 'toggleInstalled')
      change({ installedOnly: !filters.installedOnly })
    else if (action === 'sort') change({ ascending: !filters.ascending })
    else if (action === 'downloads') setDownloadsOpen(true)
    else if (action === 'refresh') actions.refresh()
    else if (action === 'menu') setMenuOpen(true)
  })

  // The sheet shows the game as it is now, not as it was when it was opened
  const sheetGame = openGame
    ? (state.games.find(
        (g) => g.app_name === openGame.app_name && g.runner === openGame.runner
      ) ?? openGame)
    : null

  return (
    <div className="console">
      <header className={`topBar${barOpen ? ' open' : ''}`}>
        {/* A temporary icon (a joystick-like glyph); the real one comes later */}
        <svg
          className="logo"
          viewBox="0 0 24 24"
          width="28"
          height="28"
          role="img"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M7 9h2v2h2v2H9v2H7v-2H5v-2h2V9Zm9 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm3 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM6 6h12a5 5 0 0 1 4.9 4l.7 4.2A3.3 3.3 0 0 1 20.4 18c-1.2 0-2.2-.6-2.8-1.6L16.9 15H7.1l-.7 1.4c-.6 1-1.6 1.6-2.8 1.6a3.3 3.3 0 0 1-3.2-3.8l.7-4.2A5 5 0 0 1 6 6Z"
          />
        </svg>
        <nav className="chips">
          {storeOptions.map((id) => (
            <button
              key={id}
              className={`chip${filters.store === id ? ' active' : ''}`}
              onClick={() => change({ store: id })}
            >
              {id === 'all' ? t('store.all') : tabLabel(tabs, id)}
            </button>
          ))}
          <span className="divider more" />
          <button
            className={`chip more${filters.installedOnly ? ' active' : ''}`}
            onClick={() => change({ installedOnly: !filters.installedOnly })}
          >
            {t('filter.installed')}
          </button>
          <button
            className="chip more"
            onClick={() => change({ ascending: !filters.ascending })}
          >
            {filters.ascending ? t('sort.az') : t('sort.za')}
          </button>
        </nav>
        <nav className="chips right more">
          <button className="chip" onClick={() => setDownloadsOpen(true)}>
            {t('header.downloads')}
            {state.queue.elements.length > 0 && (
              <span className="count">{state.queue.elements.length}</span>
            )}
          </button>
          <button className="chip" onClick={() => setMenuOpen(true)}>
            {t('header.settings')}
          </button>
          <button
            className="chip"
            onClick={actions.refresh}
            disabled={state.refreshing}
          >
            {state.refreshing ? '…' : t('header.refresh')}
          </button>
        </nav>
        <button
          className="chip burger"
          aria-label={t('header.more')}
          aria-expanded={barOpen}
          onClick={() => setBarOpen((open) => !open)}
        >
          ☰
        </button>
      </header>

      <h2 className="focusTitle">{games[index]?.title ?? ''}</h2>

      <main className="stage" ref={setStage}>
        {games.length === 0 ? (
          <p className="empty">
            {state.loaded && !state.refreshing ? (
              <>
                {t('grid.empty')}
                <br />
                {t('accounts.noneHint')}
              </>
            ) : (
              t('grid.loading')
            )}
          </p>
        ) : (
          <ScrollRoot.Provider value={stage}>
            <div className="grid" ref={gridRef} role="listbox">
              {games.map((game, i) => (
                <div className="cell" key={`${game.runner}-${game.app_name}`}>
                  <Card
                    game={game}
                    index={i}
                    status={state.statuses[game.app_name]}
                    needsUpdate={state.updates.includes(game.app_name)}
                    focused={i === index}
                    t={t}
                    onSelect={select}
                    onOpen={open}
                  />
                </div>
              ))}
            </div>
          </ScrollRoot.Provider>
        )}
      </main>

      <Hints layout={layout} t={t} />

      {sheetGame && (
        <GameSheet
          game={sheetGame}
          status={state.statuses[sheetGame.app_name]}
          needsUpdate={state.updates.includes(sheetGame.app_name)}
          defaultInstallPath={state.defaultInstallPath}
          actions={actions}
          t={t}
          onClose={() => setOpenGame(null)}
        />
      )}
      {menuOpen && (
        <Menu actions={actions} t={t} onClose={() => setMenuOpen(false)} />
      )}
      {downloadsOpen && (
        <Downloads
          state={state}
          actions={actions}
          t={t}
          onClose={() => setDownloadsOpen(false)}
        />
      )}
    </div>
  )
}
