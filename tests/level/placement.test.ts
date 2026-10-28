import { describe, expect, it } from 'vitest'
import { canPlace, footprint, snap } from '../../src/level/placement'
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
})
