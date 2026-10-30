import { describe, expect, it } from 'vitest'
import { FIELD, snap } from '../../src/level/placement'
import type { Goal, Level, Placement, Solution } from '../../src/level/types'
import { nextId } from '../../src/ui/edit'
import { copyGroup, groupBox, groupNotches, groupRotHandle, groupRotStep, guidesFor, rotationBlockers, turnedParts, moveGroup, moveZone, pasteClip, removeGroup, resizeZone, rotateGroup, selectInRect, zoneAt, zoneCorner } from '../../src/ui/selection'

const P = (id: string, kind: Placement['kind'], x: number, y: number, extra: Partial<Placement> = {}): Placement =>
  ({ id, kind, x, y, rot: 0, flip: false, settings: {}, ...extra })
const level: Level = {
  v: 1, id: 't', title: 't', goalText: '', fixedLinks: [], goals: [],
  fixed: [P('w', 'wall-brick', 400, 700)],
  inventory: [{ kind: 'ramp', count: 5 }, { kind: 'ball-tennis', count: 6 }, { kind: 'gear-small', count: 3 }],
}
const sol = (placements: Placement[], links: Solution['links'] = []): Solution => ({ placements, links })
const none = new Set<string>()
const ropeAnchor = (part: string) => ({ part, anchor: 'center' })

describe('selectInRect', () => {
  const s = sol([P('r', 'ramp', 200, 200), P('b', 'ball-tennis', 600, 200)])
  const fp = groupBox([s.placements[0]])
  it('picks parts the rectangle touches', () => {
    expect(selectInRect(level, s, { x: fp.x + fp.w - 5, y: fp.y + fp.h - 5, w: 10, h: 10 }, none)).toEqual(['r'])
    expect(selectInRect(level, s, { x: 900, y: 100, w: 10, h: 10 }, none)).toEqual([])
    expect(selectInRect(level, s, { x: 0, y: 0, w: 1280, h: 400 }, none).sort()).toEqual(['b', 'r'])
  })
  it('never returns skipped ids', () => {
    expect(selectInRect(level, s, { x: 0, y: 0, w: 1280, h: 400 }, new Set(['r']))).toEqual(['b'])
  })
})

describe('moveGroup', () => {
  it('moves every part by the same snapped offset', () => {
    const s = sol([P('a', 'ball-tennis', 100, 100), P('b', 'ball-tennis', 300, 150)])
    const r = moveGroup(level, s, ['a', 'b'], 30, -20)!
    expect(r.placements.map((p) => [p.x, p.y])).toEqual([[130, 80], [330, 130]])
    expect(moveGroup(level, s, ['a'], 34, 0)!.placements[0].x).toBe(130)
  })
  it('is all or nothing', () => {
    const s = sol([P('a', 'ball-tennis', 100, 100), P('b', 'ball-tennis', 300, 100), P('c', 'ball-tennis', 500, 100)])
    expect(moveGroup(level, s, ['a', 'b'], 200, 0)).toBeNull() // b lands on c
    expect(moveGroup(level, s, ['a'], 300, 600)).toBeNull() // a lands on the fixed wall
    expect(moveGroup(level, s, ['zz'], 10, 0)).toBeNull()
    const w = 20 // two balls side by side, shifted one step: each lands where the other was
    const row = sol([P('a', 'ball-tennis', 100, 100), P('b', 'ball-tennis', 100 + w, 100)])
    const moved = moveGroup(level, row, ['a', 'b'], w, 0)!
    expect(moved.placements.map((p) => p.x)).toEqual([100 + w, 100 + 2 * w])
  })
  it('refuses leaving the field', () => {
    const s = sol([P('a', 'ball-tennis', 100, 100), P('b', 'ball-tennis', 1200, 100)])
    expect(moveGroup(level, s, ['a', 'b'], FIELD.w, 0)).toBeNull()
    expect(moveGroup(level, s, ['a', 'b'], 100, 0)).toBeNull()
  })
  it('keeps links inside the group and drops links that can no longer hold', () => {
    const rope = { id: 'l1', kind: 'rope' as const, a: ropeAnchor('a'), b: ropeAnchor('b') }
    const s = sol([P('a', 'ball-tennis', 100, 100), P('b', 'ball-tennis', 300, 100)], [rope])
    expect(moveGroup(level, s, ['a', 'b'], 0, 100)!.links).toEqual([rope])
    // a belt between a moved gear and an outside gear is dropped once the two mesh (centres 40 apart)
    const belt = { id: 'l2', kind: 'belt' as const, a: { part: 'g1', anchor: 'belt' }, b: { part: 'g2', anchor: 'belt' } }
    const g = sol([P('g1', 'gear-small', 300, 200), P('g2', 'gear-small', 600, 200)], [belt])
    expect(moveGroup(level, g, ['g1'], -100, 0)!.links).toEqual([belt])
    expect(moveGroup(level, g, ['g1'], 260, 0)!.links).toEqual([])
  })
})

describe('groupRotStep', () => {
  it('is the coarsest step of the parts that rotate', () => {
    expect(groupRotStep([P('a', 'ramp', 0, 0), P('b', 'ramp', 0, 0)])).toBe(1)
    expect(groupRotStep([P('a', 'ramp', 0, 0), P('b', 'fan', 0, 0)])).toBe(3)
    expect(groupRotStep([P('a', 'ramp', 0, 0), P('b', 'wall-brick', 0, 0), P('c', 'ball-tennis', 0, 0)])).toBe(6)
  })
  it('turns a group of parts that never rotate by quarter turns', () => {
    expect(groupRotStep([P('a', 'ball-tennis', 0, 0), P('b', 'ball-tennis', 0, 0)])).toBe(6)
  })
})

describe('groupNotches', () => {
  const c = { x: 100, y: 100 }
  it('counts notches clockwise from straight up, rounded to the step', () => {
    expect(groupNotches(c, { x: 100, y: 0 }, 1)).toBe(0)
    expect(groupNotches(c, { x: 200, y: 100 }, 1)).toBe(6)
    expect(groupNotches(c, { x: 200, y: 90 }, 6)).toBe(6)
    expect(groupNotches(c, { x: 0, y: 100 }, 6)).toBe(-6)
    expect(groupNotches(c, { x: 200, y: 0 }, 1)).toBe(3)
  })
})

describe('groupRotHandle', () => {
  it('sits centred above the box', () => {
    expect(groupRotHandle({ x: 100, y: 200, w: 60, h: 40 })).toEqual({ x: 130, y: 200 - 30 })
  })
})

describe('rotateGroup', () => {
  const pivot = { x: 300, y: 300 }
  it('turns positions around the pivot and the parts that rotate with them', () => {
    const s = sol([P('a', 'ramp', 300, 200), P('b', 'ball-tennis', 400, 300)])
    const r = rotateGroup(level, s, ['a', 'b'], 6, pivot)!
    expect(r.placements.map((p) => [p.x, p.y, p.rot])).toEqual([[400, 300, 6], [300, 400, 0]])
  })
  it('wraps the rotation and keeps off-grid positions to the hundredth', () => {
    const s = sol([P('a', 'ramp', 300, 200, { rot: 23 })])
    const r = rotateGroup(level, s, ['a'], 2, pivot)!
    expect(r.placements[0]).toMatchObject({ x: 350, y: 213.4, rot: 1 })
  })
  it('is all or nothing', () => {
    const s = sol([P('a', 'ball-tennis', 300, 200), P('b', 'ball-tennis', 500, 300)])
    expect(rotateGroup(level, s, ['a'], 6, pivot)).not.toBeNull()
    expect(rotateGroup(level, s, ['a'], 6, { x: 350, y: 350 })).toBeNull() // a lands on b
    expect(rotateGroup(level, s, ['a'], 12, { x: 300, y: 0 })).toBeNull() // off the top
    expect(rotateGroup(level, s, ['zz'], 6, pivot)).toBeNull()
  })
  it('turns the parts even where they do not fit', () => {
    const s = sol([P('a', 'ball-tennis', 300, 200)])
    expect(turnedParts(s, ['a'], 12, { x: 300, y: 0 })).toMatchObject([{ id: 'a', x: 300, y: -200 }])
  })
  it('names the parts a turned group runs into', () => {
    const s = sol([P('a', 'ball-tennis', 300, 200), P('b', 'ball-tennis', 500, 300), P('c', 'ball-tennis', 100, 100)])
    const moved = turnedParts(s, ['a'], 6, { x: 350, y: 350 })
    expect(rotationBlockers(level, s, moved)).toEqual(['b'])
    expect(rotationBlockers(level, s, turnedParts(s, ['a'], 6, { x: 300, y: 300 }))).toEqual([])
    // the fixed wall counts too
    expect(rotationBlockers(level, s, [{ ...s.placements[0], x: 400, y: 700 }])).toEqual(['w'])
  })
  it('turns a quarter four times back home', () => {
    const s = sol([P('a', 'ramp', 300, 200, { rot: 2 }), P('b', 'wall-brick', 380, 300)])
    let r = s
    for (let i = 0; i < 4; i++) r = rotateGroup(level, r, ['a', 'b'], 6, pivot)!
    expect(r.placements).toEqual(s.placements)
  })
})

describe('removeGroup and copyGroup', () => {
  const rope = (id: string, a: string, b: string) => ({ id, kind: 'rope' as const, a: ropeAnchor(a), b: ropeAnchor(b) })
  const s = sol(
    [P('a', 'ball-tennis', 100, 100), P('b', 'ball-tennis', 300, 100), P('c', 'ball-tennis', 500, 100)],
    [rope('l1', 'a', 'b'), rope('l2', 'b', 'c')],
  )
  it('removeGroup removes parts and their links', () => {
    expect(removeGroup(s, ['b'])).toEqual(sol([s.placements[0], s.placements[2]]))
    expect(removeGroup(s, ['a', 'b']).links).toEqual([])
  })
  it('copyGroup keeps only links between copied parts', () => {
    const c = copyGroup(s, ['a', 'b'])
    expect(c.placements.map((p) => p.id)).toEqual(['a', 'b'])
    expect(c.links.map((l) => l.id)).toEqual(['l1'])
  })
})

describe('pasteClip', () => {
  const base = sol([P('p1', 'ball-tennis', 100, 100), P('p2', 'ball-tennis', 300, 100)], [
    { id: 'l1', kind: 'rope', a: ropeAnchor('p1'), b: ropeAnchor('p2') },
  ])
  const clip = copyGroup(base, ['p1', 'p2'])
  const box = groupBox(clip.placements)
  const mid = { x: box.x + box.w / 2, y: box.y + box.h / 2 }

  it('pastes at a free target with new ids and re-pointed links', () => {
    const r = pasteClip(level, base, clip, { x: 603, y: 401 }, 'at')!
    const c = { x: snap(603), y: snap(401) }
    const added = r.sol.placements.filter((p) => r.ids.includes(p.id))
    expect(r.ids).toEqual(['p3', 'p4'])
    const nb = groupBox(added)
    expect([nb.x + nb.w / 2, nb.y + nb.h / 2]).toEqual([c.x, c.y])
    expect(nextId(level, base)).toBe('p3')
    expect(r.sol.links).toHaveLength(2)
    expect(r.sol.links[1]).toMatchObject({ id: 'l2', a: { part: 'p3' }, b: { part: 'p4' } })
  })

  it('searches the nearest free spot, to the right first', () => {
    const r = pasteClip(level, base, clip, mid, 'right')!
    const nb = groupBox(r.sol.placements.filter((p) => r.ids.includes(p.id)))
    expect(nb.x).toBe(snap(box.x + box.w + 20 + box.w / 2) - box.w / 2)
    expect(nb.x).toBeGreaterThanOrEqual(box.x + box.w + 20 - 5)
    expect(nb.y).toBeCloseTo(box.y, -1)
  })

  it('falls back to a ring when the first spot is taken', () => {
    const r = pasteClip(level, base, clip, mid, 'at')!
    expect(r.ids).toHaveLength(2)
    const nb = groupBox(r.sol.placements.filter((p) => r.ids.includes(p.id)))
    expect([nb.x, nb.y]).not.toEqual([box.x, box.y])
    expect(Math.abs(nb.x - box.x)).toBeLessThanOrEqual(20)
  })

  it('refuses beyond inventory', () => {
    const lvl: Level = { ...level, inventory: [{ kind: 'ball-tennis', count: 1 }] }
    const one = sol([P('p1', 'ball-tennis', 100, 100)])
    expect(pasteClip(lvl, one, copyGroup(one, ['p1']), { x: 600, y: 300 }, 'right')).toBeNull()
  })

  it('keeps pasted gears off the fixed gears (discs overlap)', () => {
    const lvl: Level = { ...level, fixed: [P('g', 'gear-small', 600, 300)], inventory: [{ kind: 'gear-small', count: 3 }] }
    const c = { placements: [P('p1', 'gear-small', 100, 100)], links: [] }
    // 30 apart: boxes and discs overlap, so the copy must go elsewhere
    const r = pasteClip(lvl, sol([]), c, { x: 630, y: 300 }, 'at')!
    const g = r.sol.placements[0]
    expect(Math.hypot(g.x - 600, g.y - 300)).toBeGreaterThanOrEqual(39)
  })

  it('returns null when the field has no room', () => {
    // fixed bricks tile the whole field
    const fixed: Placement[] = []
    for (const [y, length] of [[160, 16], [480, 16], [720, 8]] as const) {
      for (let x = 10; x < FIELD.w; x += 20) fixed.push(P(`w${x}_${y}`, 'wall-brick', x, y, { settings: { length } }))
    }
    const full: Level = { ...level, fixed, inventory: [{ kind: 'ball-tennis', count: 9 }] }
    const c = { placements: [P('p1', 'ball-tennis', 100, 100)], links: [] }
    expect(pasteClip(full, sol([]), c, { x: 600, y: 400 }, 'right')).toBeNull()
  })
})

describe('guidesFor', () => {
  it('reports aligned edges and centres', () => {
    const a = P('a', 'ball-tennis', 200, 100)
    const ab = groupBox([a])
    // same size, same x, different y: left, centre and right all line up, as one guide each
    const g = guidesFor([P('m', 'ball-tennis', 200, 500)], [a])
    expect(g).toHaveLength(3)
    expect(g.map((q) => q.a.x).sort((p, q) => p - q)).toEqual([ab.x, 200, ab.x + ab.w])
    for (const q of g) {
      expect(q.a.x).toBe(q.b.x)
      expect([q.a.y, q.b.y]).toEqual([ab.y, 500 + ab.h / 2])
    }
  })
  it('reports an edge meeting the opposite edge of another part', () => {
    const a = P('a', 'ball-tennis', 200, 100)
    const ab = groupBox([a])
    const m = P('m', 'ball-tennis', 200 + ab.w, 300) // abuts a's right edge, not aligned in y
    expect(guidesFor([m], [a])).toEqual([{ a: { x: ab.x + ab.w, y: ab.y }, b: { x: ab.x + ab.w, y: 300 + ab.h / 2 } }])
  })
  it('returns nothing without alignment', () => {
    expect(guidesFor([P('m', 'ball-tennis', 101, 503)], [P('a', 'ball-tennis', 300, 200)])).toEqual([])
  })
})

describe('goal zones', () => {
  const z = { x: 100, y: 100, w: 100, h: 60 }

  it('moveZone snaps to 10 and stays inside the field', () => {
    expect(moveZone(z, 23, -18)).toEqual({ x: 120, y: 80, w: 100, h: 60 })
    expect(moveZone(z, -500, -500)).toEqual({ x: 0, y: 0, w: 100, h: 60 })
    expect(moveZone(z, 9999, 9999)).toEqual({ x: FIELD.w - 100, y: FIELD.h - 60, w: 100, h: 60 })
  })

  it('moveZone without an offset returns an off-grid zone as it is', () => {
    const off = { x: 984, y: 720, w: 32, h: 36 }
    expect(moveZone(off, 0, 0)).toEqual(off)
  })

  it('resizeZone moves the dragged corner and keeps the opposite one', () => {
    expect(resizeZone(z, 'se', { x: 253, y: 218 })).toEqual({ x: 100, y: 100, w: 150, h: 120 })
    expect(resizeZone(z, 'nw', { x: 60, y: 41 })).toEqual({ x: 60, y: 40, w: 140, h: 120 })
    expect(resizeZone(z, 'ne', { x: 300, y: 70 })).toEqual({ x: 100, y: 70, w: 200, h: 90 })
    expect(resizeZone(z, 'sw', { x: 50, y: 300 })).toEqual({ x: 50, y: 100, w: 150, h: 200 })
  })

  it('resizeZone never goes below 20x20 or past the field', () => {
    expect(resizeZone(z, 'se', { x: 0, y: 0 })).toEqual({ x: 100, y: 100, w: 20, h: 20 })
    expect(resizeZone(z, 'nw', { x: 900, y: 900 })).toEqual({ x: 180, y: 140, w: 20, h: 20 })
    expect(resizeZone(z, 'se', { x: 99999, y: 99999 })).toEqual({ x: 100, y: 100, w: FIELD.w - 100, h: FIELD.h - 100 })
    expect(resizeZone(z, 'nw', { x: -50, y: -50 })).toEqual({ x: 0, y: 0, w: 200, h: 160 })
  })

  it('zoneCorner finds the corner within the tolerance', () => {
    expect(zoneCorner(z, { x: 104, y: 98 }, 9)).toBe('nw')
    expect(zoneCorner(z, { x: 198, y: 103 }, 9)).toBe('ne')
    expect(zoneCorner(z, { x: 100, y: 158 }, 9)).toBe('sw')
    expect(zoneCorner(z, { x: 205, y: 165 }, 9)).toBe('se')
    expect(zoneCorner(z, { x: 150, y: 130 }, 9)).toBeUndefined()
  })

  it('zoneAt returns the last inZone goal containing the point and skips event goals', () => {
    const goals: Goal[] = [
      { type: 'inZone', part: 'a', zone: { x: 0, y: 0, w: 100, h: 100 } },
      { type: 'event', event: 'rope-cut' },
      { type: 'inZone', part: 'a', zone: { x: 50, y: 50, w: 100, h: 100 } },
    ]
    expect(zoneAt(goals, { x: 60, y: 60 })).toBe(2)
    expect(zoneAt(goals, { x: 10, y: 10 })).toBe(0)
    expect(zoneAt(goals, { x: 500, y: 500 })).toBeUndefined()
  })
})
