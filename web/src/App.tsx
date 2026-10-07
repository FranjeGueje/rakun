import { useEffect, useMemo } from 'react'
import { Console } from './console/Console'
import { ConnectionLost } from './console/ConnectionLost'
import { NetworkBanner } from './console/NetworkBanner'
import { Notice } from './console/Notice'
import { translator } from './i18n'
import { startInput, useControllerLayout } from './input/useInput'
import { useRakun } from './state/useRakun'

export default function App() {
  const { state, actions } = useRakun()
  const layout = useControllerLayout()
  const t = useMemo(() => translator(), [])

  useEffect(() => startInput(), [])

  return (
    <>
      <NetworkBanner t={t} />
      <Console state={state} actions={actions} t={t} layout={layout} />
      {state.connection !== 'online' && (
        <ConnectionLost connection={state.connection} t={t} />
      )}
      {state.connection === 'online' && state.notice && (
        <Notice notice={state.notice} t={t} onDismiss={actions.dismissNotice} />
      )}
    </>
  )
}
