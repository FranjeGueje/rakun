import { useState } from 'react'
import { supportedLanguages } from '../../../src/common/languages'
import type { Translate } from '../i18n'
import { CloseButton } from './CloseButton'
import { useLayer } from '../input/useInput'

/** «Spanish (es)»: the name in English for those who do not know the code */
export function languageLabel(code: string): string {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(
      code.replace('_', '-')
    )
    return name && name !== code ? `${name} (${code})` : code
  } catch {
    return code
  }
}

/** Left and right go through the languages rakun accepts; A saves */
export function LanguageSelect({
  title,
  current,
  t,
  onSave,
  onClose
}: {
  title: string
  current: string
  t: Translate
  /** Saves the code; answers the reason when it is refused */
  onSave: (value: string) => Promise<string | undefined>
  onClose: () => void
}) {
  const start = Math.max(supportedLanguages.indexOf(current), 0)
  const [index, setIndex] = useState(start)
  const [error, setError] = useState('')
  const count = supportedLanguages.length

  const save = async () => {
    const reason = await onSave(supportedLanguages[index])
    if (reason) setError(t('settings.failed', { error: reason }))
  }

  useLayer((action) => {
    if (action === 'left') setIndex((index - 1 + count) % count)
    else if (action === 'right') setIndex((index + 1) % count)
    else if (action === 'confirm') void save()
    else if (action === 'back') onClose()
  })

  return (
    <div className="overlay solid" role="dialog">
      <div className="panel">
        <CloseButton t={t} onClose={onClose} />
        <h1>{title}</h1>
        <p className="choice">
          <span aria-hidden="true">‹</span>
          <strong>{languageLabel(supportedLanguages[index])}</strong>
          <span aria-hidden="true">›</span>
        </p>
        <p className="muted small">{t('language.hint')}</p>
        {error && <p className="errorText">{error}</p>}
      </div>
    </div>
  )
}
