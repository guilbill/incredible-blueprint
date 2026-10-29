import './ui/style.css'
import { mountEditor } from './editor/editor'
import { EditorModel, blankLevel } from './editor/model'
import { lang, t } from './i18n'
import type { Level } from './level/types'
import { asShared, decodeLevel, levelFromFile } from './level/codec'
import { forgetLocks } from './editor/locks'
import { deleteCustomLevel, loadCustomLevels, saveCustomLevel } from './level/custom'
import { loadProgress } from './storage'
import { LANG_EVENT } from './ui/langSwitch'
import { type LevelTab, loadLevels, mountLevelList } from './ui/levels'
import { mountPlay } from './ui/play'

const app = document.querySelector<HTMLDivElement>('#app')!
const levels = loadLevels()
let tab: LevelTab = 'shipped'
let unmount: () => void = () => {}
/** Mounts the current screen again (after a language change). */
let remount: () => void = () => {}

document.documentElement.lang = lang()

let banner: HTMLElement | null = null

function showList(error?: string): void {
  unmount()
  banner?.remove()
  remount = () => showList()
  unmount = mountLevelList(app, levels, loadProgress(), {
    onPlay: play,
    tab,
    onTab: (t) => {
      tab = t
      showList()
    },
    custom: { levels: loadCustomLevels(), onEdit: edit, onNew: () => edit(blankLevel(newLevelId())), onImport: (f) => void importFile(f),
      onDelete: (l) => {
        if (deleteCustomLevel(l.id)) {
          forgetLocks(l.id)
          showList()
        } else showList(t('error.deleteStorage'))
      },
    },
  })
  if (error) showBanner(error)
}

/** Wall-clock and random are fine here: ids are UI-side and never enter the simulation. */
const newLevelId = (): string => `niveau-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

function edit(level: Level): void {
  openEditor(new EditorModel(level))
}

/** Keeps the model, so a re-mount does not drop edits that were never saved (an untouched new level). */
function openEditor(model: EditorModel): void {
  unmount()
  banner?.remove()
  tab = 'mine'
  remount = () => openEditor(model)
  unmount = mountEditor(app, model, { onTestWin: () => {}, onBack: () => showList() })
}

/** A `.tim.json` from someone else: new id (like a link), and the importer must win it again to share it. */
async function importFile(f: File): Promise<void> {
  const r = await levelFromFile(f)
  if (!r.ok) return showList(r.error)
  const level = { ...asShared(r.level), verified: false }
  if (!saveCustomLevel(level)) return showList(t('error.saveStorage'))
  edit(level)
}

function showBanner(message: string): void {
  banner?.remove()
  banner = document.createElement('div')
  banner.className = 'banner error'
  banner.setAttribute('role', 'alert')
  const text = document.createElement('span')
  text.textContent = message
  const close = document.createElement('button')
  close.className = 'btn ghost'
  close.textContent = t('common.close')
  close.addEventListener('click', () => banner?.remove())
  banner.append(text, close)
  app.append(banner)
}

function play(level: Level, list: Level[] = []): void {
  unmount()
  banner?.remove()
  remount = () => play(level, list)
  unmount = mountPlay(app, level, {
    onWin: () => {
      const i = list.indexOf(level)
      const next = i >= 0 ? list[i + 1] : undefined
      if (next) play(next, list)
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
  if (r.ok) play(asShared(r.level))
  else showList(r.error)
}

window.addEventListener(LANG_EVENT, () => remount())
window.addEventListener('hashchange', () => {
  if (location.hash.startsWith('#l=')) void openSharedLink()
})
void openSharedLink()
