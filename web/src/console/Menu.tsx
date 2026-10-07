import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, SettingKey } from '../api/types'
import type { Translate } from '../i18n'
import { CloseButton } from './CloseButton'
import { useLayer } from '../input/useInput'
import { menuValue, type MenuEntry } from '../state/selectors'
import type { Actions } from '../state/useRelicd'
import { Accounts } from './Accounts'
import { FolderPicker } from './FolderPicker'
import { LanguageSelect, languageLabel } from './LanguageSelect'
import { TextField } from './TextField'

type Entry = MenuEntry
const ENTRIES: Entry[] = [
  'accounts',
  'downloadPath',
  'protonPath',
  'steamGridDb',
  'language'
]
const KEYS: Record<Exclude<Entry, 'accounts'>, SettingKey> = {
  downloadPath: 'defaultInstallPath',
  protonPath: 'protonPath',
  steamGridDb: 'steamGridDbApiKey',
  language: 'language'
}

/** What Select opens: the screens of the client, and the few settings it changes in relicd */
export function Menu({
  actions,
  t,
  onClose
}: {
  actions: Actions
  t: Translate
  onClose: () => void
}) {
  const [focus, setFocus] = useState(0)
  const [open, setOpen] = useState<Entry | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)

  const load = useCallback(async () => {
    setSettings(await window.relicd.call('requestAppSettings'))
  }, [])
  useEffect(() => {
    load().catch(() => undefined)
  }, [load])

  /** Saves one setting; answers the reason relicd gives when it refuses it */
  const save = async (entry: Exclude<Entry, 'accounts'>, value: string) => {
    const reply = await window.relicd.setSetting(KEYS[entry], value)
    if (!reply.ok) return reply.error
    if (entry === 'downloadPath') actions.reloadSettings()
    await load()
    setOpen(null)
    return undefined
  }

  useLayer((action) => {
    if (open) return
    if (action === 'up') setFocus(Math.max(focus - 1, 0))
    else if (action === 'down')
      setFocus(Math.min(focus + 1, ENTRIES.length - 1))
    else if (action === 'confirm') setOpen(ENTRIES[focus])
    else if (action === 'back' || action === 'menu') onClose()
  })

  const close = () => setOpen(null)
  const title = open ? t(`menu.${open}`) : ''

  return (
    <div className="overlay solid" role="dialog">
      <div className="panel wide">
        <CloseButton t={t} onClose={onClose} />
        <h1>{t('menu.title')}</h1>
        <ul className="rows">
          {ENTRIES.map((entry, index) => (
            <li key={entry}>
              <button
                className={`row${index === focus ? ' focused' : ''}`}
                onMouseEnter={() => setFocus(index)}
                onClick={() => setOpen(entry)}
              >
                <span>{t(`menu.${entry}`)}</span>
                <span className="muted small">
                  {settings ? menuValue(entry, settings, t, languageLabel) : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {open === 'accounts' && (
        <Accounts actions={actions} t={t} onClose={close} />
      )}
      {open === 'downloadPath' && settings && (
        <FolderPicker
          title={title}
          start={settings.defaultInstallPath}
          t={t}
          onPick={(path) => save('downloadPath', path)}
          onClose={close}
        />
      )}
      {open === 'protonPath' && settings && (
        <FolderPicker
          title={title}
          start={settings.protonPath}
          automatic
          t={t}
          onPick={(path) => save('protonPath', path)}
          onClose={close}
        />
      )}
      {open === 'steamGridDb' && settings && (
        <TextField
          title={title}
          initial={settings.steamGridDbApiKey}
          t={t}
          onSave={(value) => save('steamGridDb', value)}
          onClose={close}
        />
      )}
      {open === 'language' && settings && (
        <LanguageSelect
          title={title}
          current={settings.language}
          t={t}
          onSave={(value) => save('language', value)}
          onClose={close}
        />
      )}
    </div>
  )
}
