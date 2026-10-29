import { describe, expect, it } from 'vitest'
import { MAGNET, canPlace, footprint, gearMagnet, snap } from '../../src/level/placement'
import type { Placement } from '../../src/level/types'

const P = (o: Partial<Placement> & Pick<Placement, 'id' | 'kind'>): Placement => ({
  x: 0, y: 0, rot: 0, flip: false, settings: {}, ...o,
})

const bbox = (pts: { x: number; y: number }[]) => {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

describe('placement', () => {
  it('snaps to 10 units', () => {
    expect(snap(13)).toBe(10)
    expect(snap(16)).toBe(20)
    expect(snap(-4)).toBe(0)
  })

  it('ramp of 4 x 1 cells is 1 x 4 cells at rot 6', () => {
    const flat = bbox(footprint(P({ id: 'r', kind: 'ramp', x: 400, y: 400 })))
    expect(flat.w).toBeCloseTo(80)
    expect(flat.h).toBeCloseTo(20)
    const up = bbox(footprint(P({ id: 'r', kind: 'ramp', x: 400, y: 400, rot: 6 })))
    expect(up.w).toBeCloseTo(20)
    expect(up.h).toBeCloseTo(80)
  })

  it('length setting stretches the footprint', () => {
    const wall = bbox(footprint(P({ id: 'w', kind: 'wall-brick', x: 400, y: 400, settings: { length: 10 } })))
    expect(wall.w).toBeCloseTo(20)
    expect(wall.h).toBeCloseTo(200)
  })

  it('refuses a part dropped on a fixed wall', () => {
    const wall = P({ id: 'w', kind: 'wall-brick', x: 400, y: 400 })
    expect(canPlace(P({ id: 'b', kind: 'ball-bowling', x: 410, y: 420 }), [wall])).toBe(false)
    expect(canPlace(P({ id: 'r', kind: 'ramp', x: 400, y: 400, rot: 3 }), [wall])).toBe(false)
    expect(canPlace(P({ id: 'b', kind: 'ball-bowling', x: 500, y: 400 }), [wall])).toBe(true)
  })

  it('accepts parts that only touch', () => {
    const wall = P({ id: 'w', kind: 'wall-brick', x: 400, y: 400 })
    expect(canPlace(P({ id: 'w2', kind: 'wall-brick', x: 420, y: 400 }), [wall])).toBe(true)
  })

  it('ignores itself when moved', () => {
    const wall = P({ id: 'w', kind: 'wall-brick', x: 400, y: 400 })
    expect(canPlace({ ...wall, x: 410 }, [wall])).toBe(true)
  })

  it('refuses out of field', () => {
    expect(canPlace(P({ id: 'b', kind: 'ball-tennis', x: 3, y: 400 }), [])).toBe(false)
    expect(canPlace(P({ id: 'b', kind: 'ball-tennis', x: 400, y: 798 }), [])).toBe(false)
    expect(canPlace(P({ id: 'w', kind: 'wall-brick', x: 640, y: 400, rot: 6, settings: { length: 16 } }), [])).toBe(true)
    expect(canPlace(P({ id: 'w', kind: 'wall-brick', x: 100, y: 400, rot: 6, settings: { length: 16 } }), [])).toBe(false)
  })

  it('refuses a rotation the part does not allow', () => {
    expect(canPlace(P({ id: 'w', kind: 'wall-brick', x: 400, y: 400, rot: 3 }), [])).toBe(false)
    expect(canPlace(P({ id: 't', kind: 'trampoline', x: 400, y: 400, rot: 6 }), [])).toBe(false)
  })

  describe('gears', () => {
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
    const small = (o: Partial<Placement> = {}) => P({ id: 's', kind: 'gear-small', x: 0, y: 0, ...o })
    const large = (o: Partial<Placement> = {}) => P({ id: 'l', kind: 'gear-large', ...o })
    const deg = (d: number) => (d * Math.PI) / 180

    it('accepts a diagonal mesh', () => {
      const a = small({ x: 300, y: 300 })
      const b = large({ x: 300 + 60 * Math.cos(deg(45)), y: 300 - 60 * Math.sin(deg(45)) })
      expect(canPlace(b, [a])).toBe(true)
    })

    it('refuses teeth biting deeper than the tolerance', () => {
      const a = small({ id: 'a', x: 300, y: 300 })
      expect(canPlace(small({ id: 'b', x: 338, y: 300 }), [a])).toBe(false)
      expect(canPlace(small({ id: 'b', x: 339, y: 300 }), [a])).toBe(true)
    })

    it('still blocks other parts with a round footprint', () => {
      const g = small({ x: 300, y: 300 })
      expect(canPlace(g, [P({ id: 'w', kind: 'wall-brick', x: 329, y: 300 })])).toBe(false)
      expect(canPlace(g, [P({ id: 'w', kind: 'wall-brick', x: 331, y: 300 })])).toBe(true)
    })

    it('pulls onto the mesh circle', () => {
      const others = [large({ x: 400, y: 300 })]
      const cursor = { x: 400 + 70 * Math.cos(deg(30)), y: 300 + 70 * Math.sin(deg(30)) }
      const r = gearMagnet(small(), cursor, others)!
      expect(r).toBeDefined()
      expect(Math.abs(dist(r, others[0]) - 60)).toBeLessThan(0.01)
      expect(Math.atan2(r.y - 300, r.x - 400)).toBeCloseTo(deg(30), 1)
      expect(Math.abs(r.x * 100 - Math.round(r.x * 100))).toBeLessThan(1e-6)
      expect(Math.abs(r.y * 100 - Math.round(r.y * 100))).toBeLessThan(1e-6)
    })

    it('does nothing out of range or for a non-gear', () => {
      const others = [large({ x: 400, y: 300 })]
      expect(gearMagnet(small(), { x: 400 + 60 + MAGNET + 1, y: 300 }, others)).toBeUndefined()
      expect(gearMagnet(P({ id: 'b', kind: 'ball-tennis' }), { x: 470, y: 300 }, others)).toBeUndefined()
    })

    it('does nothing when the meshing spot is crowded', () => {
      const others = [large({ x: 400, y: 300 }), P({ id: 'w', kind: 'wall-brick', x: 400 + 60 * Math.cos(deg(30)), y: 300 + 60 * Math.sin(deg(30)) })]
      const cursor = { x: 400 + 70 * Math.cos(deg(30)), y: 300 + 70 * Math.sin(deg(30)) }
      expect(gearMagnet(small(), cursor, others)).toBeUndefined()
    })

    it('picks the closest candidate between two gears', () => {
      const g1 = large({ id: 'g1', x: 300, y: 300 })
      const g2 = large({ id: 'g2', x: 500, y: 300 })
      const near = gearMagnet(small(), { x: 340, y: 355 }, [g1, g2])!
      expect(Math.abs(dist(near, g1) - 60)).toBeLessThan(0.01)
      const far = gearMagnet(small(), { x: 460, y: 355 }, [g1, g2])!
      expect(Math.abs(dist(far, g2) - 60)).toBeLessThan(0.01)
    })
  })
})
