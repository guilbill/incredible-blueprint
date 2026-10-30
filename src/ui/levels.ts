import { levelGoal, levelTitle, t } from '../i18n'
import type { Level } from '../level/types'
import type { Progress } from '../storage'
import { el } from './dom'
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

function levelCard(level: Level, n: number, progress: Progress, onClick: () => void): HTMLButtonElement {
  const card = el('button', 'level-card')
  const solved = progress.solved.includes(level.id)
  card.classList.toggle('solved', solved)
  card.append(el('span', 'fig', `FIG. ${n}`), el('span', 'title', levelTitle(level) || t('list.untitled')), el('span', 'goal', levelGoal(level)))
  if (solved) card.append(el('span', 'badge', t('list.solved')))
  else if (progress.drafts[level.id]?.placements?.length) card.append(el('span', 'badge draft', t('list.draft')))
  card.addEventListener('click', onClick)
  return card
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
  const grid = el('ol', 'level-grid')
  if (opts.tab === 'shipped') {
    levels.forEach((level, i) => {
      const li = el('li', 'shipped')
      // Icon only: a text label would cover the goal text of the card.
      const copyBtn = el('button', 'btn icon copy')
      copyBtn.title = t('list.copyToMine')
      copyBtn.setAttribute('aria-label', copyBtn.title)
      copyBtn.append(icon('duplicate'))
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        opts.onCopyShipped(level)
      })
      const actions = el('div', 'actions')
      actions.append(copyBtn)
      li.append(levelCard(level, i + 1, progress, () => opts.onPlay(level, levels)), actions)
      grid.append(li)
    })
    if (levels.length === 0) grid.append(el('li', 'note', t('list.empty')))
  } else {
    const { levels: mine, onEdit, onNew, onImport, onDelete, onDuplicate } = opts.custom
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
    mine.forEach((level, i) => {
      const li = el('li', 'mine')
      // Solved/draft badges would mix the author's tests with play: show the verification state only.
      const card = levelCard(level, i + 1, { solved: [], drafts: {} }, () => onEdit(level))
      card.append(level.verified ? el('span', 'badge', t('level.verified')) : el('span', 'badge todo', t('level.untested')))
      const playBtn = el('button', 'btn small', t('list.play'))
      playBtn.addEventListener('click', () => opts.onPlay(level, mine))
      const dupBtn = el('button', 'btn small', t('list.duplicate'))
      dupBtn.addEventListener('click', () => onDuplicate(level))
      const delBtn = el('button', 'btn small danger', t('list.delete'))
      delBtn.addEventListener('click', () => {
        if (confirm(t('list.confirmDelete', { title: level.title }))) onDelete(level)
      })
      const actions = el('div', 'actions')
      actions.append(playBtn, dupBtn, delBtn)
      li.append(card, actions)
      grid.append(li)
    })
  }
  screen.append(head, grid)
  root.replaceChildren(screen)
  return () => root.replaceChildren()
}
