import { LANGS, lang, setLang, t } from '../i18n'
import { el } from './dom'

/** Fired on window after the player picks another language; main.ts mounts the current screen again. */
export const LANG_EVENT = 'tim:lang'

/** `FR | EN` buttons, the current language highlighted. */
export function langSwitch(): HTMLElement {
  const box = el('div', 'lang')
  box.setAttribute('role', 'group')
  box.setAttribute('aria-label', t('lang.label'))
  LANGS.forEach((l, i) => {
    if (i > 0) box.append(el('span', 'sep', '|'))
    const on = l === lang()
    const b = el('button', `btn small ghost${on ? ' on' : ''}`, l.toUpperCase())
    b.lang = l
    b.setAttribute('aria-pressed', String(on))
    b.addEventListener('click', () => {
      if (l === lang()) return
      setLang(l)
      window.dispatchEvent(new Event(LANG_EVENT))
    })
    box.append(b)
  })
  return box
}
