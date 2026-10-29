import { describe, expect, it } from 'vitest'
import type { Level, Placement, Solution } from '../../src/level/types'
import { clientToUnits, fitCanvas, panelPosition, unitsToClient } from '../../src/ui/geometry'
import { addLink, addPart, draftPlacement, flipped, hitAnyPart, hitLink, hitPart, linkTargets, pickAnchor, nextId, remaining, removeLink, removePart, rotated, sanitizeDraft, updatePart, withSetting } from '../../src/ui/edit'
import { LIMITS } from '../../src/level/codec'
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

  it('gives drawer portals in pairs: each new portal joins the first channel with fewer than two', () => {
    const lv: Level = {
      ...level,
      fixed: [P('w', 'wall-brick', 400, 400), P('f', 'portal', 900, 100, { settings: { channel: 2 } })],
      inventory: [{ kind: 'portal', count: 4 }],
    }
    let sol = empty
    const channels: number[] = []
    for (const x of [100, 200, 300, 500]) {
      sol = addPart(lv, sol, P(nextId(lv, sol), 'portal', x, 100))!
      channels.push(sol.placements[sol.placements.length - 1].settings.channel)
    }
    expect(channels).toEqual([1, 1, 2, 3])
    // An explicit channel (moved part, restored draft) is kept.
    expect(addPart(lv, empty, P('p9', 'portal', 100, 100, { settings: { channel: 3 } }))!.placements[0].settings.channel).toBe(3)
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

describe('links', () => {
  const lv: Level = {
    ...level,
    fixed: [P('saw', 'seesaw', 400, 300), P('pl', 'pulley', 700, 300)],
    inventory: [{ kind: 'ball-tennis', count: 2 }, { kind: 'pulley', count: 1 }],
  }
  const sol: Solution = { placements: [P('p1', 'ball-tennis', 200, 200), P('p2', 'pulley', 900, 300)], links: [] }
  const A = (part: string, anchor: string) => ({ part, anchor })

  it('adds a rope or a belt by anchor role, refusing mismatches and duplicates', () => {
    const s1 = addLink(lv, sol, A('p1', 'center'), A('saw', 'left'))!
    expect(s1.links).toEqual([{ id: 'l1', kind: 'rope', a: A('p1', 'center'), b: A('saw', 'left') }])
    expect(addLink(lv, s1, A('saw', 'left'), A('p1', 'center'))).toBeNull()
    expect(addLink(lv, s1, A('p1', 'center'), A('pl', 'belt'))).toBeNull()
    const s2 = addLink(lv, s1, A('pl', 'belt'), A('p2', 'belt'))!
    expect(s2.links[1]).toEqual({ id: 'l2', kind: 'belt', a: A('pl', 'belt'), b: A('p2', 'belt') })
    expect(removeLink(s2, 'l1').links.map((l) => l.id)).toEqual(['l2'])
  })

  it('hit-tests links', () => {
    const s1 = addLink(lv, sol, A('p1', 'center'), A('saw', 'right'))!
    // Rope from (200, 200) to (460, 300): its midpoint is (330, 250).
    expect(hitLink(lv, s1, { x: 330, y: 252 })).toBe('l1')
    expect(hitLink(lv, s1, { x: 330, y: 280 })).toBeUndefined()
  })

  it('hits a belt on its straight run, not only between the centres', () => {
    const s = addLink(lv, sol, A('pl', 'belt'), A('p2', 'belt'))!
    // Pulleys at (700, 300) and (900, 300), radius 20 + gap 4: the lower run is at y = 324.
    expect(hitLink(lv, s, { x: 800, y: 324 })).toBe('l1')
    expect(hitLink(lv, s, { x: 800, y: 300 })).toBeUndefined()
  })

  it('keeps valid links through draft restore and drops the others', () => {
    const draft = {
      placements: sol.placements,
      links: [
        { id: 'l1', kind: 'rope', a: A('p1', 'center'), b: A('saw', 'left') },
        { id: 'l2', kind: 'belt', a: A('p1', 'center'), b: A('saw', 'right') },
        { id: 'l3', kind: 'belt', a: A('gone', 'belt'), b: A('pl', 'belt') },
        'junk',
        { id: 'l4', kind: 'belt', a: A('pl', 'belt'), b: A('p2', 'belt') },
      ],
    }
    expect(sanitizeDraft(lv, draft).links.map((l) => l.id)).toEqual(['l1', 'l4'])
  })
})

describe('links stay valid when parts move', () => {
  const gears: Level = { ...level, fixed: [], inventory: [{ kind: 'gear-small', count: 2 }] }
  const belt = (a: string, b: string) => [{ part: a, anchor: 'belt' }, { part: b, anchor: 'belt' }] as const

  it('moving a gear into mesh drops the belt between them', () => {
    let sol: Solution = { placements: [P('a', 'gear-small', 100, 100), P('b', 'gear-small', 200, 100)], links: [] }
    const [ea, eb] = belt('a', 'b')
    sol = addLink(gears, sol, ea, eb)!
    expect(sol.links).toHaveLength(1)
    const moved = updatePart(gears, sol, { ...sol.placements[1], x: 140 })!
    expect(moved.links).toEqual([])
  })

  it('refuses parts and links past the level caps', () => {
    const many: Level = { ...level, fixed: [], inventory: [{ kind: 'ball-tennis', count: LIMITS.fixed + 1 }] }
    const placements = Array.from({ length: LIMITS.fixed }, (_, i) => P(`p${i}`, 'ball-tennis', 20 + (i % 60) * 20, 20 + Math.floor(i / 60) * 40))
    expect(addPart(many, { placements, links: [] }, P('extra', 'ball-tennis', 600, 700))).toBeNull()
    const sol: Solution = { placements: [P('a', 'gear-small', 100, 100), P('b', 'gear-small', 200, 100)], links: [] }
    const full: Solution = { ...sol, links: Array.from({ length: LIMITS.fixedLinks }, (_, i) => ({ id: `x${i}`, kind: 'belt' as const, a: { part: 'a', anchor: 'belt' }, b: { part: 'b', anchor: 'belt' } })) }
    const [ea, eb] = belt('b', 'a')
    expect(addLink(gears, full, { ...ea }, { ...eb })).toBeNull()
  })
})

describe('link tools', () => {
  const A = (part: string, anchor: string) => ({ part, anchor })
  const lv: Level = {
    ...level,
    fixed: [P('saw', 'seesaw', 400, 300), P('pl', 'pulley', 700, 300), P('g1', 'gear-small', 1000, 300)],
    inventory: [{ kind: 'ball-tennis', count: 1 }, { kind: 'gear-small', count: 1 }],
  }
  const sol: Solution = { placements: [P('b', 'ball-tennis', 200, 200)], links: [] }

  it('lists the anchors matching the tool', () => {
    expect(linkTargets(lv, sol, 'belt')).toEqual([A('pl', 'belt'), A('g1', 'belt')])
    expect(linkTargets(lv, sol, 'rope')).toEqual([A('saw', 'left'), A('saw', 'right'), A('b', 'center')])
  })

  it('filters by the first anchor: same part, meshed gears, duplicates', () => {
    const withGear = { ...sol, placements: [...sol.placements, P('g2', 'gear-small', 1040, 300)] }
    expect(linkTargets(lv, withGear, 'belt', A('pl', 'belt'))).toEqual([A('g1', 'belt'), A('g2', 'belt')])
    // g1 and g2 mesh (centres 40 apart, radii 20 + 20).
    expect(linkTargets(lv, withGear, 'belt', A('g1', 'belt'))).toEqual([A('pl', 'belt')])
    const s = addLink(lv, withGear, A('pl', 'belt'), A('g1', 'belt'))!
    expect(linkTargets(lv, s, 'belt', A('pl', 'belt'))).toEqual([A('g2', 'belt')])
  })

  it('picks the seesaw end closest to the click', () => {
    const targets = linkTargets(lv, sol, 'rope')
    const saw = lv.fixed[0]
    expect(pickAnchor(targets, saw, lv, sol, { x: 360, y: 300 })).toEqual(A('saw', 'left'))
    expect(pickAnchor(targets, saw, lv, sol, { x: 440, y: 300 })).toEqual(A('saw', 'right'))
    expect(pickAnchor(targets, lv.fixed[1], lv, sol, { x: 360, y: 300 })).toBeUndefined()
  })

  it('hits fixed parts too, player parts first', () => {
    expect(hitAnyPart(lv, sol, { x: 700, y: 300 })?.id).toBe('pl')
    const over = { ...sol, placements: [P('b', 'ball-tennis', 700, 300)] }
    expect(hitAnyPart(lv, over, { x: 700, y: 300 })?.id).toBe('b')
    expect(hitAnyPart(lv, sol, { x: 50, y: 700 })).toBeUndefined()
  })
})
