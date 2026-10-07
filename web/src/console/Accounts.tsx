import { useCallback, useEffect, useState } from 'react'
import type { AccountsStatus, LoginInfo, StoreInfo } from '../api/types'
import type { Translate } from '../i18n'
import { CloseButton } from './CloseButton'
import { useLayer } from '../input/useInput'
import type { Actions } from '../state/useRakun'
import { ConfirmDialog } from './ConfirmDialog'
import { TextField } from './TextField'

function stateText(t: Translate, account: AccountsStatus[StoreInfo['id']]) {
  if (!account.loggedIn) return t('accounts.signedOut')
  return account.name
    ? t('accounts.signedIn', { name: account.name })
    : t('accounts.signedInNoName')
}

/** The stores and whether each has a session; A signs in or (after asking) out */
export function Accounts({
  actions,
  t,
  onClose
}: {
  actions: Actions
  t: Translate
  onClose: () => void
}) {
  const [stores, setStores] = useState<StoreInfo[]>([])
  const [accounts, setAccounts] = useState<AccountsStatus | null>(null)
  const [focus, setFocus] = useState(0)
  const [error, setError] = useState('')
  const [askLogout, setAskLogout] = useState<StoreInfo | null>(null)
  const [pasting, setPasting] = useState<{
    store: StoreInfo
    info: LoginInfo
  } | null>(null)

  const load = useCallback(async () => {
    const [list, status] = await Promise.all([
      window.rakun.call('getStores'),
      window.rakun.call('getAccounts')
    ])
    setStores(list)
    setAccounts(status)
  }, [])
  useEffect(() => {
    load().catch((e: unknown) => setError(String(e)))
  }, [load])

  /** The person logs in on the store's page and pastes the address it ends on */
  const signIn = async (store: StoreInfo) => {
    setError('')
    try {
      setPasting({ store, info: await window.rakun.login.info(store.id) })
    } catch (reason) {
      setError(t('accounts.failed', { error: String(reason) }))
    }
  }

  const submitPasted = async (text: string) => {
    if (!pasting) return undefined
    const reply = await window.rakun.login.submit(pasting.store.id, text)
    if (!reply.ok) return reply.error
    setPasting(null)
    await load()
    return undefined
  }

  const signOut = async (store: StoreInfo) => {
    setAskLogout(null)
    setError('')
    try {
      await window.rakun.call('logout', store.id)
      actions.reloadStore(store.id)
    } catch (e) {
      setError(String(e))
    }
    await load()
  }

  const activate = (store: StoreInfo | undefined) => {
    if (!store || !accounts) return
    if (accounts[store.id].loggedIn) setAskLogout(store)
    else void signIn(store)
  }

  useLayer((action) => {
    if (askLogout || pasting) return
    if (action === 'up') setFocus(Math.max(focus - 1, 0))
    else if (action === 'down') setFocus(Math.min(focus + 1, stores.length - 1))
    else if (action === 'confirm') activate(stores[focus])
    else if (action === 'back' || action === 'menu') onClose()
  })

  return (
    <div className="overlay solid" role="dialog">
      <div className="panel">
        <CloseButton t={t} onClose={onClose} />
        <h1>{t('accounts.title')}</h1>
        <ul className="rows">
          {stores.map((store, index) => (
            <li key={store.id}>
              <button
                className={`row${index === focus ? ' focused' : ''}`}
                onMouseEnter={() => setFocus(index)}
                onClick={() => activate(store)}
              >
                <span>{store.label}</span>
                <span className="muted small">
                  {accounts ? stateText(t, accounts[store.id]) : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="errorText">{error}</p>}
      </div>
      {pasting && (
        <TextField
          title={t('login.title', { store: pasting.store.label })}
          initial=""
          t={t}
          intro={
            <>
              <p>{pasting.info.instructions}</p>
              <a
                className="loginLink"
                href={pasting.info.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('login.open')}
              </a>
            </>
          }
          hint={t('login.hint')}
          paste={{ label: t('login.paste'), unreadable: t('login.unreadable') }}
          failed={(error) => t('accounts.failed', { error })}
          onSave={submitPasted}
          onClose={() => setPasting(null)}
        />
      )}
      {askLogout && (
        <ConfirmDialog
          title={t('accounts.logoutTitle', { store: askLogout.label })}
          message={t('accounts.logoutMessage')}
          t={t}
          onYes={() => void signOut(askLogout)}
          onNo={() => setAskLogout(null)}
        />
      )}
    </div>
  )
}
