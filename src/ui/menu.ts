import { el } from './dom'

/** One row of the right-click menu. */
export interface MenuItem {
  label: string
  /** Shortcut text shown at the right of the row. */
  shortcut: string
  run(): void
  enabled: boolean
}

/**
 * Shows a menu at a client position (clamped to the window). It closes on a pointerdown outside,
 * Escape or a choice; the returned function closes it too.
 */
export function openMenu(at: { x: number; y: number }, items: MenuItem[]): () => void {
  const menu = el('div', 'ctxmenu')
  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    window.removeEventListener('pointerdown', onOutside, true)
    window.removeEventListener('keydown', onKey, true)
    menu.remove()
  }
  function onOutside(e: PointerEvent): void {
    if (!menu.contains(e.target as Node)) close()
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    close()
  }
  for (const it of items) {
    const row = el('button', 'item')
    row.append(el('span', 'label', it.label), el('span', 'shortcut', it.shortcut))
    row.disabled = !it.enabled
    row.addEventListener('click', () => {
      close()
      it.run()
    })
    menu.append(row)
  }
  document.body.append(menu)
  menu.style.left = `${Math.max(0, Math.min(at.x, window.innerWidth - menu.offsetWidth))}px`
  menu.style.top = `${Math.max(0, Math.min(at.y, window.innerHeight - menu.offsetHeight))}px`
  window.addEventListener('pointerdown', onOutside, true)
  window.addEventListener('keydown', onKey, true)
  return close
}
