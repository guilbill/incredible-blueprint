import type { Level } from '../level/types'
import type { Progress } from '../storage'

/** Shipped levels: every levels/*.json except the reference solutions, sorted by file name. */
export function loadLevels(): Level[] {
  const mods = import.meta.glob<Level>(['../../levels/*.json', '!../../levels/*.solution.json'], { eager: true, import: 'default' })
  return Object.keys(mods)
    .sort()
    .map((k) => mods[k])
}

export interface LevelListOpts { onPlay(level: Level): void }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

export function mountLevelList(root: HTMLElement, levels: Level[], progress: Progress, opts: LevelListOpts): () => void {
  const screen = el('div', 'levels')
  const head = el('header', 'levels-head')
  head.append(el('h1', '', 'La Machine Incroyable'), el('p', 'note', 'Plans de machines · choisissez un niveau'))
  const grid = el('ol', 'level-grid')
  levels.forEach((level, i) => {
    const li = el('li')
    const card = el('button', 'level-card')
    const solved = progress.solved.includes(level.id)
    card.classList.toggle('solved', solved)
    card.append(el('span', 'fig', `FIG. ${i + 1}`), el('span', 'title', level.title), el('span', 'goal', level.goalText))
    if (solved) card.append(el('span', 'badge', 'Réussi'))
    else if (progress.drafts[level.id]?.placements?.length) card.append(el('span', 'badge draft', 'En cours'))
    card.addEventListener('click', () => opts.onPlay(level))
    li.append(card)
    grid.append(li)
  })
  if (levels.length === 0) grid.append(el('li', 'note', 'Aucun niveau trouvé.'))
  screen.append(head, grid)
  root.replaceChildren(screen)
  return () => root.replaceChildren()
}
