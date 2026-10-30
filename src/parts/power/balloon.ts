import { compound } from '../../engine/bodies'
import { type Vec, v } from '../../engine/vec'
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
/** Teardrop envelope: follows the circle down to y = SHOULDER, then narrows straight to the mouth. */
const SHOULDER = 1.3
const MOUTH = v(6, 14)
const TOP = ENVELOPE.y - R

/** Half width of the teardrop envelope at height y (local). */
function halfWidth(y: number): number {
  if (y <= SHOULDER) {
    const dy = y - ENVELOPE.y
    return Math.sqrt(Math.max(0, R * R - dy * dy))
  }
  const dy = SHOULDER - ENVELOPE.y
  const w = Math.sqrt(R * R - dy * dy)
  return w + ((MOUTH.x - w) * (y - SHOULDER)) / (MOUTH.y - SHOULDER)
}

/** Local points of a meridian at fraction k of the half width, from the top to the mouth (denser near the top). */
const meridian = (k: number, n = 40): Vec[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const y = TOP + (MOUTH.y - TOP) * t * t
    return v(k * halfWidth(y), y)
  })

const ANCHOR: AnchorDef = { key: 'basket', local: v(0, 30), role: 'rope' }
/** Upward force while heated, in multiples of the balloon's weight. */
const LIFT = 1.4
/** A lit flame heats the balloon when within |dx| < 20 and 0 < dy < 80 of the balloon's centre. */
const COLUMN = { dx: 20, dy: 80 }
/** Consecutive steps over a lit flame after which the balloon stays heated for good. */
const HEAT_STEPS = 30

/**
 * Light dynamic hot-air balloon. Over a lit candle it gets an upward force of 1.4 × its weight;
 * after 30 consecutive steps over one it is heated (`state.heated`) and keeps that lift for good,
 * so it floats away even once it has left the candle.
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
    const W = (pts: Vec[]) => toWorld(pose, pts)
    const right = meridian(1)
    pen.poly(W([...right, ...right.map((q) => v(-q.x, q.y)).reverse()]))
    for (const k of [-0.5, 0, 0.5]) pen.path(W(meridian(k)))
    const hw = BASKET_WH.x / 2
    const top = BASKET.y - BASKET_WH.y / 2
    const bottom = BASKET.y + BASKET_WH.y / 2
    pen.poly(W([v(-hw, top), v(hw, top), v(hw - 1, bottom), v(-hw + 1, bottom)]))
    for (const x of [-1, 1]) {
      const [a, b] = W([v(x * MOUTH.x, MOUTH.y), v(x * (hw - 0.5), top)])
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
    inst.state.heat = 0
    inst.state.heated = 0
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
      const over = sim.parts.some((c) => {
        if (c.kind !== 'candle' || !c.state.lit) return false
        const f = flameOf(c)
        const dy = f.y - at.y
        return Math.abs(f.x - at.x) < COLUMN.dx && dy > 0 && dy < COLUMN.dy
      })
      if (!inst.state.heated) {
        inst.state.heat = over ? inst.state.heat + 1 : 0
        if (inst.state.heat >= HEAT_STEPS) inst.state.heated = 1
      }
      if (!over && !inst.state.heated) return
      b.applyForceToCenter({ x: 0, y: -LIFT * b.getMass() * toM(GRAVITY) }, true)
      sim.activate(inst)
    }
    return inst
  },
}
