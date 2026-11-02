import { describe, expect, it } from 'vitest'
import { toU } from '../../src/engine/world'
import { Simulation } from '../../src/game/simulation'
import { validateLevel } from '../../src/level/codec'
import type { Level, Link, PartKind, Placement, Solution } from '../../src/level/types'
import { canLink } from '../../src/parts/mech/links'
import { partDef } from '../../src/parts/registry'
import { addLink, usefulLinkTools } from '../../src/ui/edit'

const P = (id: string, kind: PartKind, x: number, y: number, o: Partial<Placement> = {}): Placement => ({
  id, kind, x, y, rot: 0, flip: false, settings: {}, ...o,
})
const level = (fixed: Placement[], fixedLinks: Link[] = [], inventory: Level['inventory'] = []): Level => ({
  v: 1, id: 't', title: 't', fixed, fixedLinks, inventory, goals: [],
})
const empty: Solution = { placements: [], links: [] }
const wire = (a: string, b: string): Link => ({ id: `w-${a}-${b}`, kind: 'wire', a: { part: a, anchor: 'wire' }, b: { part: b, anchor: 'wire' } })
const run = (s: Simulation, n: number) => {
  for (let i = 0; i < n; i++) s.step()
}
const part = (s: Simulation, id: string) => s.parts.find((p) => p.id === id)!
const xOf = (s: Simulation, id: string) => toU(part(s, id).bodies[0].getPosition().x)

/** Floor top at y 490, a magnet at x 300 and a steel ball 80 units to its right, a button at x 180. */
const bench = (extra: Placement[] = []): Placement[] => [
  P('floor', 'wall-brick', 300, 500, { rot: 6, settings: { length: 16 } }),
  P('magnet', 'magnet', 300, 480),
  P('steel', 'ball-base', 380, 482),
  P('button', 'button', 180, 480),
  ...extra,
]

describe('button and wire', () => {
  it('is a static 2 × 1 part with one wire anchor, and the magnet takes a wire', () => {
    expect(partDef('button').size).toEqual({ w: 2, h: 1 })
    expect(partDef('button').anchors).toEqual([expect.objectContaining({ key: 'wire', role: 'wire' })])
    expect(partDef('magnet').anchors).toEqual([expect.objectContaining({ key: 'wire', role: 'wire' })])
  })

  it('an unwired magnet still pulls', () => {
    const s = new Simulation(level(bench()), empty)
    run(s, 60)
    expect(xOf(s, 'steel')).toBeLessThan(370)
  })

  it('a wired magnet stays off while nothing presses its button', () => {
    const s = new Simulation(level(bench(), [wire('button', 'magnet')]), empty)
    run(s, 120)
    expect(xOf(s, 'steel')).toBeCloseTo(380, 0)
    expect(part(s, 'magnet').glow).toBe(0)
    expect(part(s, 'button').state.pressed).toBe(0)
  })

  it('a ball resting on the button switches the wired magnet on', () => {
    const s = new Simulation(level(bench([P('weight', 'ball-bowling', 173, 440)]), [wire('magnet', 'button')]), empty)
    let pressed = 0
    for (let i = 0; i < 120; i++) {
      s.step()
      pressed = Math.max(pressed, part(s, 'button').state.pressed)
    }
    expect(pressed).toBe(1)
    expect(xOf(s, 'steel')).toBeLessThan(370)
  })

  it('a wire joins a button to a magnet, never two buttons or two magnets', () => {
    const parts = [P('b1', 'button', 0, 0), P('b2', 'button', 100, 0), P('m1', 'magnet', 200, 0), P('m2', 'magnet', 300, 0)]
    const A = (part: string) => ({ part, anchor: 'wire' })
    expect(canLink(A('b1'), A('m1'), parts)).toBe(true)
    expect(canLink(A('m2'), A('b2'), parts)).toBe(true)
    expect(canLink(A('b1'), A('b2'), parts)).toBe(false)
    expect(canLink(A('m1'), A('m2'), parts)).toBe(false)
    const l = addLink(level(parts), empty, A('b1'), A('m1'))
    expect(l?.links[0].kind).toBe('wire')
  })

  it('levels keep their wires', () => {
    expect(validateLevel(level(bench(), [wire('button', 'magnet')]))).toBeNull()
  })
})

describe('link tools in the drawer', () => {
  it('shows only the tools the level parts can use', () => {
    expect(usefulLinkTools(level([P('w', 'wall-brick', 0, 0)]))).toEqual([])
    expect(usefulLinkTools(level([P('m', 'magnet', 0, 0)], [], [{ kind: 'button', count: 1 }]))).toEqual(['wire'])
    expect(usefulLinkTools(level([P('m', 'magnet', 0, 0)], [], [{ kind: 'magnet', count: 2 }]))).toEqual([])
    expect(usefulLinkTools(level([], [], [{ kind: 'button', count: 3 }]))).toEqual([])
  })

  it('counts each copy in the drawer: two pulleys are enough for a belt', () => {
    const takesBelt = (['pulley', 'gear-small', 'mouse-cage'] as PartKind[]).find((k) => partDef(k).anchors.some((d) => d.role === 'belt'))!
    expect(usefulLinkTools(level([], [], [{ kind: takesBelt, count: 1 }]))).not.toContain('belt')
    expect(usefulLinkTools(level([], [], [{ kind: takesBelt, count: 2 }]))).toContain('belt')
  })
})
