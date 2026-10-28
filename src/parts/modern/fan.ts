import { applyForce, centreOf, staticBox } from '../../engine/bodies'
import { dot, rotate, scale, sub, v } from '../../engine/vec'
import { CELL, angleOf, instance, pos, setting } from '../common'
import { applyGlow, poseOf, rectPts, toWorld } from '../drawing'
import type { PartDef, SettingDef } from '../types'

const DELAY: SettingDef = { key: 'delay', label: 'Délai (× 0,5 s)', min: 0, max: 20, step: 1, def: 0 }
const POWER: SettingDef = { key: 'power', label: 'Puissance', min: 1, max: 5, step: 1, def: 3 }
/** Steps per delay unit (0.5 s at 120 Hz). */
const STEPS_PER_DELAY = 60
/** Blow zone in front of the fan: 12 cells long, 2 cells wide. */
const ZONE_LEN = 12 * CELL
const ZONE_HALF = CELL
/** Force per unit of power, in multiples of the body's mass (units/s²), at the fan's face. */
const BLOW = 1500
const HALF = CELL

/**
 * Static fan (2 × 2) blowing along its local +x axis (−x when flipped). From step `delay × 60`
 * on (`state.on`), every active dynamic body whose centre is in the 12 × 2 cell zone in front of
 * it gets `power × 1500 × mass × (1 − d / 240)` along the axis, d measured from the fan's face.
 */
export const fan: PartDef = {
  kind: 'fan',
  label: 'Ventilateur',
  size: { w: 2, h: 2 },
  rotStep: 3,
  flippable: true,
  settings: [DELAY, POWER],
  anchors: [],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const pose = poseOf(s)
    const sx = s.placement.flip ? -1 : 1
    const W = (pts: { x: number; y: number }[]) => toWorld(pose, pts.map((q) => v(q.x * sx, q.y)))
    // housing on the back, a hub and three blades facing the blow side
    pen.poly(W(rectPts(12, 2 * HALF).map((q) => v(q.x - 14, q.y))))
    const [hub] = W([v(4, 0)])
    pen.circle(hub, 4)
    const spin = s.inst?.state.on ? (s.inst.state.turn ?? 0) : 0
    for (let k = 0; k < 3; k++) {
      const a = spin + (k * 2 * Math.PI) / 3
      const tip = v(4 + Math.cos(a) * 3, Math.sin(a) * 18)
      const [h, t] = W([v(4, 0), tip])
      pen.line(h, t)
    }
    const [stem, foot] = W([v(-8, HALF - 4), v(-8, HALF)])
    pen.line(stem, foot)
    // airflow marks once running
    if (s.inst?.state.on) {
      pen.dashed(true)
      for (const y of [-10, 0, 10]) {
        const [a, b] = W([v(HALF + 2, y), v(HALF + 14, y)])
        pen.line(a, b)
      }
    }
  },
  build({ world }, p) {
    const angle = angleOf(p)
    const b = staticBox(world, pos(p), v(2 * CELL, 2 * CELL), angle, {
      friction: 0.4,
      data: { part: p.id, tags: ['fan'] },
    })
    const inst = instance(p, [b])
    const axis = rotate(v(p.flip ? -1 : 1, 0), angle)
    const across = v(-axis.y, axis.x)
    const at = pos(p)
    const startAt = setting(p, DELAY) * STEPS_PER_DELAY
    const power = setting(p, POWER)
    inst.state.on = 0
    inst.state.turn = 0
    inst.onStep = (sim) => {
      if (sim.step < startAt) return
      inst.state.on = 1
      inst.state.turn = (inst.state.turn + 0.1 * power) % (2 * Math.PI)
      sim.activate(inst)
      for (const o of sim.world.bodies()) {
        if (!o.isDynamic() || !o.isActive()) continue
        const rel = sub(centreOf(o), at)
        const d = dot(rel, axis) - HALF
        if (d < 0 || d > ZONE_LEN || Math.abs(dot(rel, across)) > ZONE_HALF) continue
        applyForce(o, scale(axis, power * BLOW * o.getMass() * (1 - d / ZONE_LEN)))
      }
    }
    return inst
  },
}
