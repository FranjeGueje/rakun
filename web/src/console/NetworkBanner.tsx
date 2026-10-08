import { isNetworkWeb } from '../api/webMode'
import type { Translate } from '../i18n'

/** rakun tells the page how the web was opened (a `<meta>`); open to the network it has no protection, and says so */
export function NetworkBanner({ t }: { t: Translate }) {
  if (!isNetworkWeb()) return null
  return (
    <p className="networkWarning" role="note">
      {t('web.networkWarning')}
    </p>
  )
}
