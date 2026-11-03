import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runUntilGoal } from '../../src/game/simulation'
import { canPlace } from '../../src/level/placement'
import type { Level, Placement } from '../../src/level/types'
import { PEEK, discovery, loadLevels, mountLevelList } from '../../src/ui/levels'
import sandboxJson from '../../levels/00-sandbox.json'

describe('shipped levels', () => {
  const levels = loadLevels()

  it('loads levels/*.json sorted by file name, without the dev sandbox', () => {
    expect(levels[0].id).toBe('01-premier-plan')
    expect(levels.map((l) => l.id)).not.toContain('00-sandbox')
    expect(levels.every((l) => l.v === 1)).toBe(true)
  })

  it('sandbox: fixed parts are placeable, unsolved alone, solved with one ramp', () => {
    const sandbox = sandboxJson as Level
    for (const p of sandbox.fixed) expect(canPlace(p, sandbox.fixed)).toBe(true)
    expect(runUntilGoal(sandbox, { placements: [], links: [] }, 600).met).toBe(false)
    const ramp: Placement = { id: 'p1', kind: 'ramp', x: 300, y: 450, rot: 1, flip: false, settings: { length: 12 } }
    expect(runUntilGoal(sandbox, { placements: [ramp], links: [] }, 600).met).toBe(true)
  })
})

// Tests run without a DOM: a tiny stand-in with what mountLevelList and `el` use.
class FakeEl {
  className = ''
  textContent = ''
  hidden = false
  type = ''
  title = ''
  accept = ''
  lang = ''
  children: FakeEl[] = []
  handlers: Record<string, ((e: unknown) => void)[]> = {}
  classList = {
    add: (c: string) => this.classList.toggle(c, true),
    toggle: (c: string, on: boolean) => {
      const cs = new Set(this.className.split(' ').filter(Boolean))
      if (on) cs.add(c)
      else cs.delete(c)
      this.className = [...cs].join(' ')
    },
  }
  constructor(public tag: string) {}
  get lastElementChild() { return this.children.at(-1) }
  append(...n: FakeEl[]) { this.children.push(...n) }
  replaceChildren(...n: FakeEl[]) { this.children = n }
  setAttribute() {}
  addEventListener(type: string, fn: (e: unknown) => void) { (this.handlers[type] ??= []).push(fn) }
  click() {
    let stopped = false
    for (const h of this.handlers.click ?? []) h({ stopPropagation: () => { stopped = true } })
    return stopped
  }
  all(): FakeEl[] { return [this, ...this.children.flatMap((c) => (c instanceof FakeEl ? c.all() : []))] }
}

describe('level list copy and duplicate buttons', () => {
  beforeEach(() => vi.stubGlobal('document', { createElement: (tag: string) => new FakeEl(tag), createElementNS: (_ns: string, tag: string) => new FakeEl(tag) }))
  afterEach(() => vi.unstubAllGlobals())

  const shipped = loadLevels().slice(0, 2)
  const mine: Level = { ...shipped[0], id: 'niveau-x', title: 'Perso', verified: false }
  const mount = (tab: 'shipped' | 'mine') => {
    const calls = { play: vi.fn(), copy: vi.fn(), dup: vi.fn() }
    const root = new FakeEl('div')
    // First level solved: both are reached, so neither is blurred.
    mountLevelList(root as unknown as HTMLElement, shipped, { solved: [shipped[0].id], drafts: {} }, {
      onPlay: calls.play,
      onCopyShipped: calls.copy,
      tab,
      onTab: () => {},
      custom: { levels: [mine], onEdit: () => {}, onNew: () => {}, onImport: () => {}, onDelete: () => {}, onDuplicate: calls.dup },
    })
    return { root, calls }
  }
  const button = (root: FakeEl, title: string) => root.all().find((e) => e.tag === 'button' && e.title === title)

  it('shipped cards copy without playing', () => {
    const { root, calls } = mount('shipped')
    const btns = root.all().filter((e) => e.title === 'Copier dans mes niveaux')
    expect(btns).toHaveLength(shipped.length)
    expect(btns[1].click()).toBe(true) // propagation stopped
    expect(calls.copy).toHaveBeenCalledWith(shipped[1])
    expect(calls.play).not.toHaveBeenCalled()
  })

  it('custom levels have a Dupliquer button', () => {
    const { root, calls } = mount('mine')
    button(root, 'Dupliquer')!.click()
    expect(calls.dup).toHaveBeenCalledWith(mine)
  })
})

describe('level discovery', () => {
  const levels = loadLevels()
  const ids = (n: number) => levels.slice(0, n).map((l) => l.id)

  it('new player: the first level sharp, the next few blurred, the rest hidden', () => {
    const { shown, blurred } = discovery(levels, { solved: [], drafts: {} })
    expect(shown).toBe(1 + PEEK)
    expect(blurred).toEqual([false, true, true, true])
  })

  it('solved and started levels stay sharp, even past the next one', () => {
    const progress = { solved: ids(3), drafts: { [levels[6].id]: { placements: [{ id: 'p', kind: 'ramp' as const, x: 0, y: 0, rot: 0, flip: false, settings: {} }], links: [] } } }
    const { shown, blurred } = discovery(levels, progress)
    expect(shown).toBe(7 + PEEK)
    expect(blurred.map((b, i) => (b ? i : -1)).filter((i) => i >= 0)).toEqual([4, 5, 7, 8, 9])
  })

  it('every level solved: all shown, none blurred', () => {
    expect(discovery(levels, { solved: ids(levels.length), drafts: {} })).toEqual({ shown: levels.length, blurred: levels.map(() => false) })
  })
})

describe('level list discovery, tip and finale', () => {
  beforeEach(() => vi.stubGlobal('document', { createElement: (tag: string) => new FakeEl(tag), createElementNS: (_ns: string, tag: string) => new FakeEl(tag) }))
  afterEach(() => vi.unstubAllGlobals())

  const levels = loadLevels()
  const mount = (solved: string[]) => {
    const calls = { copy: vi.fn(), tab: vi.fn() }
    const root = new FakeEl('div')
    mountLevelList(root as unknown as HTMLElement, levels, { solved, drafts: {} }, {
      onPlay: () => {},
      onCopyShipped: calls.copy,
      tab: 'shipped',
      onTab: calls.tab,
      custom: { levels: [], onEdit: () => {}, onNew: () => {}, onImport: () => {}, onDelete: () => {}, onDuplicate: () => {} },
    })
    return { all: root.all(), calls }
  }

  it('hides the count behind a fade and blurred cards have no copy button', () => {
    const { all } = mount([])
    expect(all.filter((e) => e.tag === 'li' && e.className.startsWith('shipped'))).toHaveLength(1 + PEEK)
    expect(all.filter((e) => e.className.includes('unseen'))).toHaveLength(PEEK)
    expect(all.filter((e) => e.title === 'Copier dans mes niveaux')).toHaveLength(1)
    expect(all.some((e) => e.className === 'more')).toBe(true)
    expect(all.some((e) => e.className.includes('fading'))).toBe(true)
  })

  it('the tip edits a copy of the next level', () => {
    const { all, calls } = mount(levels.slice(0, 2).map((l) => l.id))
    all.find((e) => e.className === 'link')!.click()
    expect(calls.copy).toHaveBeenCalledWith(levels[2])
  })

  it('all solved: no dots, no tip, the finale opens My levels', () => {
    const { all, calls } = mount(levels.map((l) => l.id))
    expect(all.some((e) => e.className === 'more' || e.className === 'tip-card')).toBe(false)
    all.find((e) => e.textContent === 'Créer mes niveaux')!.click()
    expect(calls.tab).toHaveBeenCalledWith('mine')
  })
})
