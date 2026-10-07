import type { ConnectionState } from '../api/channels'
import type { Translate } from '../i18n'

/** Covers the app while rakun does not answer; nothing behind it can be used */
export function ConnectionLost({
  connection,
  t
}: {
  connection: ConnectionState
  t: Translate
}) {
  return (
    <div className="overlay solid" role="alert">
      <div className="panel center">
        {connection === 'offline' ? (
          <>
            <h1>{t('offline.title')}</h1>
            <p>{t('offline.hint')}</p>
          </>
        ) : (
          <h1>{t('offline.connecting')}</h1>
        )}
      </div>
    </div>
  )
}
