import type { HelperInfo } from '../api/types'
import { isNetworkWeb } from '../api/webMode'
import type { Translate } from '../i18n'
import type { Actions } from '../state/useRakun'

/** Says which helper binaries are missing and offers to download them; nothing when none is */
export function HelpersBanner({
  helpers,
  update,
  actions,
  t
}: {
  helpers: HelperInfo[]
  update: { running: boolean; line: string }
  actions: Pick<Actions, 'updateHelpers'>
  t: Translate
}) {
  const missing = helpers.filter(({ state }) => state === 'missing')
  if (!missing.length && !update.running) return null
  // Rakun would refuse the request: it only downloads them for its own machine
  const remote = isNetworkWeb() && !update.running
  return (
    <div className="helpersBanner" role="alert">
      <span>
        {update.running
          ? update.line || t('helpers.working')
          : t(remote ? 'helpers.missingRemote' : 'helpers.missing', {
              helpers: missing.map(({ helper }) => helper).join(', ')
            })}
      </span>
      {!remote && (
        <button
          className="chip active"
          disabled={update.running}
          onClick={() => actions.updateHelpers()}
        >
          {t('helpers.download')}
        </button>
      )}
    </div>
  )
}
