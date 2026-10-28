import './ui/style.css'
import type { Level } from './level/types'
import { decodeLevel } from './level/codec'
import { loadCustomLevels } from './level/custom'
import { loadProgress } from './storage'
import { loadLevels, mountLevelList } from './ui/levels'
import { mountPlay } from './ui/play'

const app = document.querySelector<HTMLDivElement>('#app')!
const levels = [...loadLevels(), ...loadCustomLevels()]
let unmount: () => void = () => {}

function showList(error?: string): void {
  unmount()
  unmount = mountLevelList(app, levels, loadProgress(), { onPlay: play })
  if (error) showBanner(error)
}

function showBanner(message: string): void {
  const banner = document.createElement('div')
  banner.className = 'banner error'
  banner.setAttribute('role', 'alert')
  const text = document.createElement('span')
  text.textContent = message
  const close = document.createElement('button')
  close.className = 'btn ghost'
  close.textContent = 'Fermer'
  close.addEventListener('click', () => banner.remove())
  banner.append(text, close)
  app.append(banner)
}

function play(level: Level): void {
  unmount()
  unmount = mountPlay(app, level, {
    onWin: () => {
      const i = levels.indexOf(level)
      const next = i >= 0 ? levels[i + 1] : undefined
      if (next) play(next)
      else showList()
    },
    onBack: () => showList(),
  })
}

/** Opens a shared `#l=` link: play it, or explain what is wrong over the level list. Clears the hash. */
async function openSharedLink(): Promise<void> {
  const m = /^#l=(.*)$/.exec(location.hash)
  if (!m) return showList()
  history.replaceState(null, '', location.pathname + location.search)
  const r = await decodeLevel(m[1])
  if (r.ok) play(r.level)
  else showList(r.error)
}

void openSharedLink()
