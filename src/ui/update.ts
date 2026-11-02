import { registerSW } from 'virtual:pwa-register'
import { t } from '../i18n'
import { el } from './dom'
import { icon } from './icons'

/** How often an open game asks the server for a new version. */
const CHECK_MS = 60 * 1000

/**
 * Registers the service worker and checks for a new version every minute while the tab is visible,
 * and when the player comes back to it. `onReady` runs when a new version is installed and waiting.
 * Returns the reload that switches to it.
 */
export function watchForUpdates(onReady: () => void): () => void {
  let reg: ServiceWorkerRegistration | undefined
  const updateSW = registerSW({
    onNeedRefresh: onReady,
    onRegisteredSW(_url, registration) {
      reg = registration
      if (!registration) return
      const check = (): void => {
        if (document.visibilityState === 'visible' && navigator.onLine && !registration.installing) void registration.update()
      }
      setInterval(check, CHECK_MS)
      document.addEventListener('visibilitychange', check)
    },
  })
  // On a first visit the page is not controlled yet, so the new version is already active: a plain reload is enough.
  return () => {
    if (reg?.waiting) void updateSW(true)
    else location.reload()
  }
}

/** The banner under the level list title: "new version", Reload, Later. */
export function updateBanner(onReload: () => void, onLater: () => void): HTMLElement {
  const box = el('div', 'update-banner')
  box.setAttribute('role', 'status')
  const reload = el('button', 'btn small primary', t('update.reload'))
  reload.addEventListener('click', onReload)
  const later = el('button', 'btn small ghost', t('update.later'))
  later.addEventListener('click', onLater)
  box.append(icon('rotate'), el('span', 'text', t('update.ready')), reload, later)
  return box
}
