import { compound, touching } from '../../engine/bodies'
import { type Vec, v } from '../../engine/vec'
import { angleOf, instance, pos } from '../common'
import { applyGlow, poseOf, toWorld } from '../drawing'
import type { PartDef, PartInstance } from '../types'

/** Housing (local x −18..8, y 0..10), cap on top of it (x −12..−2), lamp and cord socket on the right. */
const HOUSING = { x0: -18, x1: 8, y0: 0, y1: 10 }
const CAP = { x0: -12, x1: -2, up: -7, down: -4 }
const LAMP = v(3, 5)
/** Where the wire leaves the housing (the `wire` anchor). */
const SOCKET = v(HOUSING.x1, 5)

/** Twisted cord: a small wave along the segment a → b, `turns` waves, 2 units wide. */
export function coilPts(a: Vec, b: Vec, turns: number): Vec[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const n = Math.sqrt(dx * dx + dy * dy) || 1
  const steps = turns * 8
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    const w = i === 0 || i === steps ? 0 : 2 * Math.sin(t * turns * 2 * Math.PI)
    return v(a.x + dx * t - (dy / n) * w, a.y + dy * t + (dx / n) * w)
  })
}

/**
 * True while a dynamic body rests on the button's top (contact normal within 60° of the button's
 * up). Read straight from the contacts, so it does not depend on which part steps first.
 */
export function isPressed(inst: PartInstance | undefined): boolean {
  const b = inst?.bodies[0]
  if (!b) return false
  const a = b.getAngle()
  const up = v(Math.sin(a), -Math.cos(a))
  return touching(b).some((t) => t.other.isDynamic() && t.normal.x * up.x + t.normal.y * up.y < -0.5)
}

/**
 * Static push button (2 × 1). It stays pressed while something rests on it (`state.pressed`), and
 * every part wired to it reads that through `isPressed`. Unwired, it shows a loose cord with a plug.
 */
export const button: PartDef = {
  kind: 'button',
  label: 'Bouton',
  size: { w: 2, h: 1 },
  rotStep: 6,
  flippable: true,
  settings: [],
  anchors: [{ key: 'wire', local: SOCKET, role: 'wire' }],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const pose = poseOf(s)
    const sx = s.placement.flip ? -1 : 1
    const W = (pts: Vec[]) => toWorld(pose, pts.map((q) => v(q.x * sx, q.y)))
    const pressed = (s.inst?.state.pressed ?? 0) > 0
    const top = pressed ? CAP.down : CAP.up
    pen.poly(W([v(HOUSING.x0, HOUSING.y0), v(HOUSING.x1, HOUSING.y0), v(HOUSING.x1, HOUSING.y1), v(HOUSING.x0, HOUSING.y1)]))
    pen.poly(W([v(CAP.x0, top), v(CAP.x1, top), v(CAP.x1, 0), v(CAP.x0, 0)]))
    const [lamp] = W([LAMP])
    pen.circle(lamp, 2)
    if (pressed) pen.ctx.fill()
    if (!s.wired) {
      // Loose cord curling up to a plug, inside the footprint.
      const plug = v(16, -5)
      pen.path(W(coilPts(SOCKET, plug, 3)))
      pen.circle(W([plug])[0], 2)
    }
  },
  build({ world }, p) {
    const b = compound(
      world,
      pos(p),
      [
        { kind: 'box', wh: v(HOUSING.x1 - HOUSING.x0, HOUSING.y1 - HOUSING.y0), offset: v(((HOUSING.x0 + HOUSING.x1) / 2) * (p.flip ? -1 : 1), (HOUSING.y0 + HOUSING.y1) / 2) },
        { kind: 'box', wh: v(CAP.x1 - CAP.x0, -CAP.down), offset: v(((CAP.x0 + CAP.x1) / 2) * (p.flip ? -1 : 1), CAP.down / 2) },
      ],
      { type: 'static', angle: angleOf(p), friction: 0.6, data: { part: p.id, tags: ['button'] } },
    )
    const inst = instance(p, [b], { wire: { body: b, local: v(SOCKET.x * (p.flip ? -1 : 1), SOCKET.y), radius: 0 } })
    inst.state.pressed = 0
    inst.onStep = (sim) => {
      inst.state.pressed = isPressed(inst) ? 1 : 0
      if (inst.state.pressed) sim.activate(inst)
    }
    return inst
  },
}
