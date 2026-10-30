import { levelTitle, t } from '../i18n'
import { FIELD } from '../level/placement'
import type { Level } from '../level/types'
import { render } from '../render/renderer'
import type { Progress } from '../storage'
import { el } from './dom'
import { sanitizeDraft } from './edit'
import { icon } from './icons'
import { langSwitch } from './langSwitch'

/**
 * Shipped levels: every levels/*.json except the reference solutions and the dev sandbox
 * (00-sandbox, kept for tests), sorted by file name.
 */
export function loadLevels(): Level[] {
  const mods = import.meta.glob<Level>(['../../levels/*.json', '!../../levels/*.solution.json', '!../../levels/00-sandbox.json'], {
    eager: true,
    import: 'default',
  })
  return Object.keys(mods)
    .sort()
    .map((k) => mods[k])
}

const REPO_URL = 'https://github.com/guilbill/incredible-blueprint'

export type LevelTab = 'shipped' | 'mine'

export interface LevelListOpts {
  onPlay(level: Level, list: Level[]): void
  /** Shipped levels are never edited: this makes an editable copy in "Mes niveaux". */
  onCopyShipped(level: Level): void
  /** "Mes niveaux" tab: levels made with the editor. */
  custom: { levels: Level[]; onEdit(level: Level): void; onNew(): void; onImport(file: File): void; onDelete(level: Level): void; onDuplicate(level: Level): void }
  tab: LevelTab
  onTab(tab: LevelTab): void
}

/** Miniature of a level board as the player left it (their machine when they have one), drawn once. */
function miniature(level: Level, progress: Progress, px: number): HTMLCanvasElement {
  const c = el('canvas', 'mini')
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  c.width = Math.round(px * dpr)
  c.height = Math.round((px * dpr * FIELD.h) / FIELD.w)
  const ctx = typeof c.getContext === 'function' ? c.getContext('2d') : null
  if (ctx) render(ctx, { level, sol: sanitizeDraft(level, progress.drafts[level.id]), zoom: c.width / FIELD.w, won: progress.solved.includes(level.id) })
  return c
}

type LevelState = 'solved' | 'draft' | 'todo'
const stateOf = (level: Level, progress: Progress): LevelState =>
  progress.solved.includes(level.id) ? 'solved' : progress.drafts[level.id]?.placements?.length ? 'draft' : 'todo'

/** Shipped level in the atlas: the drawing and the caption under it. */
function levelFigure(level: Level, n: number, progress: Progress, onClick: () => void): HTMLButtonElement {
  const fig = el('button', `level-fig ${stateOf(level, progress)}`)
  const thumb = el('span', 'thumb')
  thumb.append(miniature(level, progress, 320))
  const caption = el('span', 'caption')
  caption.append(el('span', 'fig', `FIG. ${n}`), el('span', 'title', levelTitle(level) || t('list.untitled')))
  fig.append(thumb, caption)
  fig.addEventListener('click', onClick)
  return fig
}

/** Level made with the editor: the drawing opens the editor, the bar under the caption plays, duplicates or deletes. */
function myLevelFigure(level: Level, n: number, custom: LevelListOpts['custom'], onPlay: () => void): HTMLLIElement {
  const li = el('li', 'mine')
  const fig = el('button', 'level-fig')
  fig.addEventListener('click', () => custom.onEdit(level))
  const thumb = el('span', 'thumb')
  // Solved/draft states would mix the author's tests with play: show the verification state only.
  thumb.append(
    miniature(level, { solved: [], drafts: {} }, 320),
    level.verified ? el('span', 'badge', t('level.verified')) : el('span', 'badge todo', t('level.untested')),
  )
  const caption = el('span', 'caption')
  caption.append(el('span', 'fig', `FIG. ${n}`), el('span', 'title', levelTitle(level) || t('list.untitled')))
  fig.append(thumb, caption)
  const action = (name: 'play' | 'duplicate' | 'delete', label: string, run: () => void): HTMLButtonElement => {
    const b = el('button', name === 'delete' ? 'btn icon danger' : 'btn icon')
    b.title = label
    b.setAttribute('aria-label', label)
    b.append(icon(name))
    b.addEventListener('click', run)
    return b
  }
  const bar = el('div', 'actions')
  bar.append(
    action('play', t('list.play'), onPlay),
    action('duplicate', t('list.duplicate'), () => custom.onDuplicate(level)),
    action('delete', t('list.delete'), () => {
      if (confirm(t('list.confirmDelete', { title: level.title }))) custom.onDelete(level)
    }),
  )
  li.append(fig, bar)
  return li
}

/** The next unsolved level, large, with the player's machine so far and Continue (or Play). */
function nextCard(level: Level, n: number, progress: Progress, onPlay: () => void): HTMLElement {
  const box = el('section', 'level-next')
  const started = stateOf(level, progress) === 'draft'
  const thumb = el('button', 'thumb')
  thumb.setAttribute('aria-label', levelTitle(level))
  thumb.append(miniature(level, progress, 640))
  thumb.addEventListener('click', onPlay)
  const side = el('div', 'next-info')
  const go = el('button', 'btn primary', started ? t('list.continue') : t('list.play'))
  go.addEventListener('click', onPlay)
  side.append(el('span', 'fig', `FIG. ${n} · ${started ? t('list.draft') : t('list.next')}`), el('h2', 'title', levelTitle(level)), go)
  box.append(thumb, side)
  return box
}

export function mountLevelList(root: HTMLElement, levels: Level[], progress: Progress, opts: LevelListOpts): () => void {
  const screen = el('div', 'levels')
  const head = el('header', 'levels-head')
  head.append(langSwitch(), el('h1', '', t('list.title')), el('p', 'note', t('list.subtitle')))
  const tabs = el('nav', 'tabs')
  for (const [tab, label] of [['shipped', t('list.tabShipped')], ['mine', t('list.tabMine')]] as const) {
    const b = el('button', `tab${opts.tab === tab ? ' active' : ''}`, label)
    b.addEventListener('click', () => opts.onTab(tab))
    tabs.append(b)
  }
  head.append(tabs)
  const grid = el('ol', 'level-atlas')
  let next: HTMLElement | undefined
  if (opts.tab === 'shipped') {
    const nextIndex = levels.findIndex((l) => !progress.solved.includes(l.id))
    if (nextIndex >= 0) next = nextCard(levels[nextIndex], nextIndex + 1, progress, () => opts.onPlay(levels[nextIndex], levels))
    levels.forEach((level, i) => {
      const li = el('li', 'shipped')
      const copyBtn = el('button', 'btn icon copy')
      copyBtn.title = t('list.copyToMine')
      copyBtn.setAttribute('aria-label', copyBtn.title)
      copyBtn.append(icon('duplicate'))
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        opts.onCopyShipped(level)
      })
      li.append(levelFigure(level, i + 1, progress, () => opts.onPlay(level, levels)), copyBtn)
      grid.append(li)
    })
    if (levels.length === 0) grid.append(el('li', 'note', t('list.empty')))
  } else {
    const { levels: mine, onNew, onImport } = opts.custom
    const tools = el('li', 'level-tools')
    const create = el('button', 'btn primary', t('list.new'))
    create.addEventListener('click', onNew)
    const importLabel = el('label', 'btn', t('list.import'))
    const file = el('input')
    file.type = 'file'
    file.accept = '.json,application/json'
    file.hidden = true
    file.addEventListener('change', () => {
      const f = file.files?.[0]
      if (f) onImport(f)
      file.value = ''
    })
    importLabel.append(file)
    tools.append(create, importLabel)
    grid.append(tools)
    mine.forEach((level, i) => grid.append(myLevelFigure(level, i + 1, opts.custom, () => opts.onPlay(level, mine))))
  }
  const foot = el('footer', 'levels-foot')
  const source = el('a', '', t('list.source'))
  source.href = REPO_URL
  source.target = '_blank'
  source.rel = 'noopener'
  foot.append(source)
  screen.append(head, ...(next ? [next] : []), grid, foot)
  root.replaceChildren(screen)
  return () => root.replaceChildren()
}
