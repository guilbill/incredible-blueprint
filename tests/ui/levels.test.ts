import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runUntilGoal } from '../../src/game/simulation'
import { canPlace } from '../../src/level/placement'
import type { Level, Placement } from '../../src/level/types'
import { loadLevels, mountLevelList } from '../../src/ui/levels'
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
  accept = ''
  lang = ''
  children: FakeEl[] = []
  handlers: Record<string, ((e: unknown) => void)[]> = {}
  classList = {
    toggle: (c: string, on: boolean) => {
      const cs = new Set(this.className.split(' ').filter(Boolean))
      if (on) cs.add(c)
      else cs.delete(c)
      this.className = [...cs].join(' ')
    },
  }
  constructor(public tag: string) {}
  append(...n: FakeEl[]) { this.children.push(...n) }
  replaceChildren(...n: FakeEl[]) { this.children = n }
  setAttribute() {}
  addEventListener(type: string, fn: (e: unknown) => void) { (this.handlers[type] ??= []).push(fn) }
  click() {
    let stopped = false
    for (const h of this.handlers.click ?? []) h({ stopPropagation: () => { stopped = true } })
    return stopped
  }
  all(): FakeEl[] { return [this, ...this.children.flatMap((c) => c.all())] }
}

describe('level list copy and duplicate buttons', () => {
  beforeEach(() => vi.stubGlobal('document', { createElement: (tag: string) => new FakeEl(tag) }))
  afterEach(() => vi.unstubAllGlobals())

  const shipped = loadLevels().slice(0, 2)
  const mine: Level = { ...shipped[0], id: 'niveau-x', title: 'Perso', verified: false }
  const mount = (tab: 'shipped' | 'mine') => {
    const calls = { play: vi.fn(), copy: vi.fn(), dup: vi.fn() }
    const root = new FakeEl('div')
    mountLevelList(root as unknown as HTMLElement, shipped, { solved: [], drafts: {} }, {
      onPlay: calls.play,
      onCopyShipped: calls.copy,
      tab,
      onTab: () => {},
      custom: { levels: [mine], onEdit: () => {}, onNew: () => {}, onImport: () => {}, onDelete: () => {}, onDuplicate: calls.dup },
    })
    return { root, calls }
  }
  const button = (root: FakeEl, text: string) => root.all().find((e) => e.tag === 'button' && e.textContent === text)

  it('shipped cards copy without playing', () => {
    const { root, calls } = mount('shipped')
    const btns = root.all().filter((e) => e.textContent === 'Copier dans mes niveaux')
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
