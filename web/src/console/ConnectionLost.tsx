import { useState } from 'react'
import type { ConnectionState } from '../api/channels'
import type { Translate } from '../i18n'
import { useLayer } from '../input/useInput'

/** Covers the app while rakun does not answer; nothing behind it can be used */
export function ConnectionLost({
  connection,
  t
}: {
  connection: ConnectionState
  t: Translate
}) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const offline = connection === 'offline'
  // A desktop app can start rakun and leave; a page can only wait for it to come back
  const { start: canStart, quit } = window.rakun

  const start = () => {
    if (!canStart || starting || !offline) return
    setStarting(true)
    setError('')
    canStart()
      .then((reply) => {
        if (!reply.ok) setError(reply.error)
      })
      .catch((failure: unknown) =>
        setError(failure instanceof Error ? failure.message : String(failure))
      )
      .finally(() => setStarting(false))
  }

  useLayer((action) => {
    if (action === 'confirm') start()
    else if (action === 'back') quit?.()
  })

  return (
    <div className="overlay solid" role="alert">
      <div className="panel center">
        {!offline ? (
          <h1>{t('offline.connecting')}</h1>
        ) : (
          <>
            <h1>{t('offline.title')}</h1>
            <p>{t(canStart ? 'offline.hintStart' : 'offline.hint')}</p>
            {canStart && (
              <div className="buttons centered">
                <button
                  className={`button focused${starting ? ' disabled' : ''}`}
                  onClick={start}
                >
                  {starting ? t('offline.starting') : t('offline.start')}
                </button>
              </div>
            )}
            {error && (
              <p className="errorText">{t('offline.startFailed', { error })}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
