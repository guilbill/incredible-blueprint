import type { Level } from '../level/types'
import type { Progress } from '../storage'
import { el } from './dom'

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
  /** "Mes niveaux" tab: levels made with the editor. */
  custom: { levels: Level[]; onEdit(level: Level): void; onNew(): void; onImport(file: File): void; onDelete(level: Level): void }
  tab: LevelTab
  onTab(tab: LevelTab): void
}

function levelCard(level: Level, n: number, progress: Progress, onClick: () => void): HTMLButtonElement {
  const card = el('button', 'level-card')
  const solved = progress.solved.includes(level.id)
  card.classList.toggle('solved', solved)
  card.append(el('span', 'fig', `FIG. ${n}`), el('span', 'title', level.title || 'Sans titre'), el('span', 'goal', level.goalText))
  if (solved) card.append(el('span', 'badge', 'Réussi'))
  else if (progress.drafts[level.id]?.placements?.length) card.append(el('span', 'badge draft', 'En cours'))
  card.addEventListener('click', onClick)
  return card
}

export function mountLevelList(root: HTMLElement, levels: Level[], progress: Progress, opts: LevelListOpts): () => void {
  const screen = el('div', 'levels')
  const head = el('header', 'levels-head')
  head.append(el('h1', '', 'La Machine Incroyable'), el('p', 'note', 'Plans de machines · choisissez un niveau'))
  const tabs = el('nav', 'tabs')
  for (const [tab, label] of [['shipped', 'Niveaux'], ['mine', 'Mes niveaux']] as const) {
    const b = el('button', `tab${opts.tab === tab ? ' active' : ''}`, label)
    b.addEventListener('click', () => opts.onTab(tab))
    tabs.append(b)
  }
  head.append(tabs)
  const grid = el('ol', 'level-grid')
  if (opts.tab === 'shipped') {
    levels.forEach((level, i) => {
      const li = el('li')
      li.append(levelCard(level, i + 1, progress, () => opts.onPlay(level, levels)))
      grid.append(li)
    })
    if (levels.length === 0) grid.append(el('li', 'note', 'Aucun niveau trouvé.'))
  } else {
    const { levels: mine, onEdit, onNew, onImport, onDelete } = opts.custom
    const tools = el('li', 'level-tools')
    const create = el('button', 'btn primary', '+ Nouveau niveau')
    create.addEventListener('click', onNew)
    const importLabel = el('label', 'btn', 'Importer un fichier')
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
      card.append(level.verified ? el('span', 'badge', 'Vérifié') : el('span', 'badge todo', 'À tester'))
      const playBtn = el('button', 'btn small', 'Jouer')
      playBtn.addEventListener('click', () => opts.onPlay(level, mine))
      const delBtn = el('button', 'btn small danger', 'Supprimer')
      delBtn.addEventListener('click', () => {
        if (confirm(`Supprimer le niveau « ${level.title} » ? C’est définitif.`)) onDelete(level)
      })
      const actions = el('div', 'actions')
      actions.append(playBtn, delBtn)
      li.append(card, actions)
      grid.append(li)
    })
  }
  screen.append(head, grid)
  root.replaceChildren(screen)
  return () => root.replaceChildren()
}
