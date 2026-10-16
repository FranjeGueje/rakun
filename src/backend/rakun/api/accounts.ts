import { addHandler } from 'backend/ipc'
import { getStore, RUNNERS, stores } from 'backend/storeManagers'
import { STORE_CAPS } from 'backend/storeManagers/caps'
import type {
  AccountCheck,
  AccountsCheck,
  AccountsStatus
} from 'common/rakun/accounts'
import type { Runner } from 'common/types'
import type { StoreInfo } from 'common/rakun/stores'

/** The stores rakun supports, in the order clients show them */
addHandler('getStores', (): StoreInfo[] =>
  RUNNERS.map((runner) => {
    const { id, name, label } = stores[runner]
    return { id, name, label, caps: STORE_CAPS[runner] }
  })
)

/**
 * Who is logged in to each store, from what is stored locally (no network:
 * Zoom's own check asks its API every time)
 */
addHandler('getAccounts', (): AccountsStatus => {
  const accounts = {} as AccountsStatus
  RUNNERS.forEach((runner) => {
    accounts[runner] = stores[runner].session.account()
  })
  return accounts
})

/**
 * Like getAccounts, but each store with a way to ask is asked over the network
 * whether the session still works. What cannot be asked, or did not answer,
 * comes back as what is stored here, with `verified: false`.
 */
addHandler('checkAccounts', async (): Promise<AccountsCheck> => {
  const checked = await Promise.all(
    RUNNERS.map(async (runner): Promise<[Runner, AccountCheck]> => {
      const { session } = stores[runner]
      const { loggedIn } = session.account()
      if (!loggedIn) return [runner, { loggedIn, verified: true }]
      const works = await session.check?.().catch(() => undefined)
      return [
        runner,
        { loggedIn: works ?? loggedIn, verified: works !== undefined }
      ]
    })
  )
  return Object.fromEntries(checked) as AccountsCheck
})

addHandler('logout', (_e, runner) => getStore(runner).session.logout())
