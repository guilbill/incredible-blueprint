import { describe, expect, it } from 'vitest'
import type { Level, Placement, Solution } from '../../src/level/types'
import { clientToUnits, fitCanvas, panelPosition, unitsToClient } from '../../src/ui/geometry'
import { addPart, draftPlacement, flipped, hitPart, nextId, remaining, removePart, rotated, sanitizeDraft, updatePart, withSetting } from '../../src/ui/edit'
import { MAX_STEPS_PER_FRAME, STEP_MS, stepsDue } from '../../src/ui/loop'

const P = (id: string, kind: Placement['kind'], x: number, y: number, extra: Partial<Placement> = {}): Placement =>
  ({ id, kind, x, y, rot: 0, flip: false, settings: {}, ...extra })
const empty: Solution = { placements: [], links: [] }
const level: Level = {
  v: 1, id: 't', title: 't', goalText: '', fixedLinks: [], goals: [],
  fixed: [P('w', 'wall-brick', 400, 400)],
  inventory: [{ kind: 'ramp', count: 2 }, { kind: 'ball-tennis', count: 1 }],
}

describe('geometry', () => {
  it('fits the 1280×800 field in the box, keeping the aspect, with dpr in the backing store', () => {
    expect(fitCanvas(1280, 2000, 1)).toEqual({ cssW: 1280, cssH: 800, pxW: 1280, pxH: 800, zoom: 1 })
    const f = fitCanvas(1000, 400, 2)
    expect(f.cssH).toBe(400)
    expect(f.cssW).toBe(640)
    expect(f.pxW).toBe(1280)
    expect(f.zoom).toBe(1)
  })

  it('converts client coordinates to units and back', () => {
    const rect = { left: 100, top: 50, width: 640, height: 400 }
    expect(clientToUnits(100, 50, rect)).toEqual({ x: 0, y: 0 })
    expect(clientToUnits(420, 250, rect)).toEqual({ x: 640, y: 400 })
    expect(unitsToClient({ x: 1280, y: 800 }, rect)).toEqual({ x: 740, y: 450 })
  })
})

describe('panelPosition', () => {
  const stage = { left: 100, top: 50, width: 800, height: 500 }
  it('sits right of the anchor, in stage-local pixels', () => {
    expect(panelPosition({ x: 300, y: 200 }, stage, { w: 170, h: 120 })).toEqual({ x: 210, y: 150 })
  })
  it('is clamped inside the stage with an 8 px margin', () => {
    expect(panelPosition({ x: 890, y: 540 }, stage, { w: 170, h: 120 })).toEqual({ x: 622, y: 372 })
    expect(panelPosition({ x: 0, y: 0 }, stage, { w: 170, h: 120 })).toEqual({ x: 8, y: 8 })
  })
})

describe('loop', () => {
  it('steps at 120 Hz and carries the remainder', () => {
    const r = stepsDue(0, 20)
    expect(r.steps).toBe(2)
    expect(r.acc).toBeCloseTo(20 - 2 * STEP_MS)
    expect(stepsDue(r.acc, 0).steps).toBe(0)
  })

  it('caps at 8 steps per frame and drops the backlog', () => {
    expect(stepsDue(0, 1000)).toEqual({ steps: MAX_STEPS_PER_FRAME, acc: 0 })
    expect(stepsDue(0, -5)).toEqual({ steps: 0, acc: 0 })
  })
})

describe('edit', () => {
  it('counts what is left in the inventory', () => {
    const sol = { placements: [P('p1', 'ramp', 100, 100)], links: [] }
    expect(remaining(level, sol).get('ramp')).toBe(1)
    expect(remaining(level, sol).get('ball-tennis')).toBe(1)
  })

  it('adds a snapped part, refuses when none is left or when it overlaps', () => {
    const p = draftPlacement('ball-tennis', { x: 103, y: 96 }, nextId(level, empty))
    expect(p).toMatchObject({ id: 'p1', x: 100, y: 100 })
    const sol = addPart(level, empty, p)!
    expect(sol.placements).toHaveLength(1)
    expect(addPart(level, sol, P('p2', 'ball-tennis', 600, 100))).toBeNull()
    expect(addPart(level, empty, P('p3', 'ramp', 400, 400))).toBeNull()
    expect(addPart(level, empty, P('p3', 'cat', 600, 600))).toBeNull()
  })

  it('picks ids not used by fixed parts or the solution', () => {
    const lv = { ...level, fixed: [P('p1', 'wall-brick', 400, 400)] }
    expect(nextId(lv, { placements: [P('p2', 'ramp', 100, 100)], links: [] })).toBe('p3')
  })

  it('moves a part onto free space but not onto another part', () => {
    const sol = addPart(level, empty, P('p1', 'ramp', 100, 100))!
    expect(updatePart(level, sol, { ...sol.placements[0], x: 120 })!.placements[0].x).toBe(120)
    expect(updatePart(level, sol, { ...sol.placements[0], x: 400, y: 400 })).toBeNull()
  })

  it('rotates by rotStep, wraps, and refuses non-rotatable or non-flippable parts', () => {
    expect(rotated(P('a', 'ramp', 0, 0), -1)!.rot).toBe(23)
    expect(rotated(P('a', 'wall-wood', 0, 0, { rot: 18 }), 1)!.rot).toBe(0)
    expect(rotated(P('a', 'ball-tennis', 0, 0), 1)).toBeNull()
    expect(flipped(P('a', 'ramp', 0, 0))).toBeNull()
  })

  it('steps and clamps settings', () => {
    const r = P('a', 'ramp', 0, 0)
    expect(withSetting(r, 'length', 5)!.settings.length).toBe(5)
    expect(withSetting(r, 'length', 99)!.settings.length).toBe(12)
    expect(withSetting(r, 'length', 4)).toBeNull()
    expect(withSetting(r, 'nope', 1)).toBeNull()
  })

  it('hit-tests rotated footprints, topmost first', () => {
    const sol = { placements: [P('a', 'ramp', 200, 200, { rot: 6 })], links: [] }
    expect(hitPart(sol, { x: 200, y: 160 })?.id).toBe('a')
    expect(hitPart(sol, { x: 160, y: 200 })).toBeUndefined()
  })

  it('removes a part and its links', () => {
    const sol: Solution = {
      placements: [P('a', 'ramp', 0, 0)],
      links: [{ id: 'l', kind: 'rope', a: { part: 'a', anchor: 'x' }, b: { part: 'w', anchor: 'y' } }],
    }
    expect(removePart(sol, 'a')).toEqual(empty)
  })

  it('sanitises a saved draft: drops garbage, over-count and overlapping parts', () => {
    const draft = {
      placements: [
        P('p1', 'ball-tennis', 100, 100), P('p2', 'ball-tennis', 200, 100), P('p3', 'ramp', 400, 400),
        { id: 'p4', kind: 'ramp', x: 'oops' }, null, P('p5', 'ramp', 600, 600),
      ],
      links: [],
    }
    expect(sanitizeDraft(level, draft).placements.map((p) => p.id)).toEqual(['p1', 'p5'])
    expect(sanitizeDraft(level, 'nonsense')).toEqual(empty)
  })
})
