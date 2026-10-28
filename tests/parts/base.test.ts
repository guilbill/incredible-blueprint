import { describe, expect, it } from 'vitest'
import { World, toU } from '../../src/engine/world'
import { partDef } from '../../src/parts/registry'
import type { PartKind, Placement } from '../../src/level/types'

const P = (kind: PartKind, x: number, y: number, o: Partial<Placement> = {}): Placement => ({
  id: kind, kind, x, y, rot: 0, flip: false, settings: {}, ...o,
})

const build = (w: World, p: Placement) => partDef(p.kind).build({ world: w, ground: w.ground }, p)

describe('base parts', () => {
  const expected: [PartKind, number][] = [
    ['ball-bowling', 1], ['ball-base', 1], ['ball-basket', 1], ['ball-tennis', 1],
    ['wall-brick', 1], ['wall-wood', 1], ['ramp', 1], ['bucket', 1], ['trampoline', 1], ['seesaw', 1],
  ]
  for (const [kind, n] of expected) {
    it(`${kind} adds ${n} body`, () => {
      const w = new World()
      const before = w.bodies().length
      const inst = build(w, P(kind, 400, 400))
      expect(w.bodies().length - before).toBe(n)
      expect(inst.bodies).toHaveLength(n)
      expect(inst.id).toBe(kind)
      expect(inst.glow).toBe(0)
    })
  }

  it('bucket has a rope handle', () => {
    const w = new World()
    const inst = build(w, P('bucket', 400, 400))
    expect(inst.anchors.handle.body).toBe(inst.bodies[0])
    expect(partDef('bucket').anchors).toEqual([expect.objectContaining({ key: 'handle', role: 'rope' })])
  })

  it('seesaw tilts when a ball lands on one end', () => {
    const w = new World()
    const saw = build(w, P('seesaw', 400, 400))
    build(w, P('ball-bowling', 450, 300))
    for (let i = 0; i < 120; i++) w.step()
    expect(saw.bodies[0].getAngle()).toBeGreaterThan(0.1)
    expect(toU(saw.bodies[0].getPosition().x)).toBeCloseTo(400)
  })

  it('throws a clear error for an unregistered kind', () => {
    expect(() => partDef('magnet')).toThrow(/magnet/)
  })

  it('a ball bounces higher on a trampoline than on a wall', () => {
    const rebound = (floor: Placement): number => {
      const w = new World()
      build(w, floor)
      const ball = build(w, P('ball-base', 400, 300)).bodies[0]
      let bounced = false
      let top = Infinity
      for (let i = 0; i < 360; i++) {
        w.step()
        const vy = ball.getLinearVelocity().y
        if (!bounced && vy < 0) bounced = true
        if (bounced) top = Math.min(top, toU(ball.getPosition().y))
        if (bounced && vy > 0) break
      }
      expect(bounced).toBe(true)
      return 600 - top
    }
    const onWall = rebound(P('wall-wood', 400, 610, { rot: 6, settings: { length: 3 } }))
    const onTramp = rebound(P('trampoline', 400, 610))
    expect(onTramp).toBeGreaterThan(onWall * 1.5)
  })
})
