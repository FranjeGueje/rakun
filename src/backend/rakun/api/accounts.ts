import { addHandler } from 'backend/ipc'
import { getStore, RUNNERS, stores } from 'backend/storeManagers'
import type { AccountsStatus } from 'common/rakun/accounts'
import type { StoreInfo } from 'common/rakun/stores'

/** The stores rakun supports, in the order clients show them */
addHandler('getStores', (): StoreInfo[] =>
  RUNNERS.map((runner) => {
    const { id, name, label } = stores[runner]
    return { id, name, label }
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

addHandler('logout', (_e, runner) => getStore(runner).session.logout())
