import { compound } from '../../engine/bodies'
import { v } from '../../engine/vec'
import { GRAVITY, bodyPose, toM } from '../../engine/world'
import { CELL, DENSITY, instance, pos } from '../common'
import { applyGlow, poseOf, toWorld } from '../drawing'
import type { AnchorDef, PartDef } from '../types'
import { flameOf } from './candle'

const R = CELL
/** Envelope centre and basket, local to the 2 × 3 footprint centre. */
const ENVELOPE = v(0, -10)
const BASKET = v(0, 26)
const BASKET_WH = v(12, 8)
const ANCHOR: AnchorDef = { key: 'basket', local: v(0, 30), role: 'rope' }
/** Upward force while heated, in multiples of the balloon's weight. */
const LIFT = 1.4
/** Heated when a lit flame is within |dx| < 20 and 0 < dy < 80 of the balloon's centre. */
const COLUMN = { dx: 20, dy: 80 }

/**
 * Light dynamic hot-air balloon. Over a lit candle it gets an upward force of 1.4 × its weight.
 * When the envelope top reaches the top edge of the field (y = 0) it emits `balloon-ceiling`
 * once, and the edge holds it there (no upward speed past it).
 */
export const balloon: PartDef = {
  kind: 'balloon',
  label: 'Montgolfière',
  size: { w: 2, h: 3 },
  rotStep: 0,
  flippable: false,
  settings: [],
  anchors: [ANCHOR],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const pose = poseOf(s)
    const W = (pts: { x: number; y: number }[]) => toWorld(pose, pts)
    const [c] = W([ENVELOPE])
    pen.circle(c, R)
    // gores: from the envelope top to its mouth
    const top = v(0, ENVELOPE.y - R)
    const mouth = ENVELOPE.y + 17
    for (const x of [-8, 0, 8]) pen.path(W([top, v(x * 1.6, ENVELOPE.y), v(x, mouth)]))
    const hw = BASKET_WH.x / 2
    const hh = BASKET_WH.y / 2
    pen.poly(W([v(-hw, BASKET.y - hh), v(hw, BASKET.y - hh), v(hw, BASKET.y + hh), v(-hw, BASKET.y + hh)]))
    for (const x of [-hw, hw]) {
      const [a, b] = W([v(x, BASKET.y - hh), v(x * 0.9, ENVELOPE.y + 17)])
      pen.line(a, b)
    }
  },
  build({ world }, p) {
    const b = compound(
      world,
      pos(p),
      [
        { kind: 'circle', r: R, offset: ENVELOPE },
        { kind: 'box', wh: BASKET_WH, offset: BASKET },
      ],
      { density: 0.1 * DENSITY, friction: 0.4, restitution: 0.2, data: { part: p.id, tags: ['balloon'] } },
    )
    const inst = instance(p, [b], { basket: { body: b, local: ANCHOR.local, radius: 0 } })
    inst.state.ceiling = 0
    inst.onStep = (sim) => {
      const at = bodyPose(b)
      const top = at.y + ENVELOPE.y - R
      if (top <= 0) {
        if (!inst.state.ceiling) {
          inst.state.ceiling = 1
          sim.emit('balloon-ceiling', inst.id)
        }
        const vel = b.getLinearVelocity()
        if (vel.y < 0) b.setLinearVelocity({ x: vel.x, y: 0 })
        return
      }
      for (const c of sim.parts) {
        if (c.kind !== 'candle' || !c.state.lit) continue
        const f = flameOf(c)
        const dx = f.x - at.x
        const dy = f.y - at.y
        if (Math.abs(dx) >= COLUMN.dx || dy <= 0 || dy >= COLUMN.dy) continue
        b.applyForceToCenter({ x: 0, y: -LIFT * b.getMass() * toM(GRAVITY) }, true)
        sim.activate(inst)
        return
      }
    }
    return inst
  },
}
