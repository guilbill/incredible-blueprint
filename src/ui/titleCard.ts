import { t } from '../i18n'
import { el } from './dom'

const HOLD_MS = 1800
const FADE_MS = 900

/**
 * Title card shown over the first screen at launch: a drawing title block with a large "MIT",
 * held, then faded out to reveal the screen under it. A click or any key skips it.
 */
export function showTitleCard(root: HTMLElement): void {
  const card = el('div', 'title-card')
  card.setAttribute('aria-hidden', 'true')
  const block = el('div', 'title-block')
  block.append(el('div', 'mit', 'MIT'), el('div', 'rule'), el('div', 'name', t('list.title')), el('div', 'plate', t('title.plate')))
  card.append(block)
  root.append(card)

  let gone = false
  const fade = (): void => {
    if (gone) return
    gone = true
    clearTimeout(timer)
    window.removeEventListener('keydown', fade, true)
    card.classList.add('fading')
    window.setTimeout(() => card.remove(), FADE_MS)
  }
  const timer = window.setTimeout(fade, HOLD_MS)
  card.addEventListener('pointerdown', fade)
  window.addEventListener('keydown', fade, true)
}
