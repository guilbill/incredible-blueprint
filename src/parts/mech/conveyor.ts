import { data, dynamicCircle, staticBox, touching } from '../../engine/bodies'
import { pin } from '../../engine/joints'
import { add, v } from '../../engine/vec'
import { CELL, DENSITY, instance, pos } from '../common'
import { applyGlow, poseOf } from '../drawing'
import type { PartDef } from '../types'

const W = 6 * CELL
const H = CELL
/** Drive wheel, inside the left end of the belt. */
const WHEEL_R = H / 2
const WHEEL_AT = v(-W / 2 + WHEEL_R, 0)
/** Surface speed (units/s) per rad/s of the drive wheel. */
const SPEED_PER_RAD = 20

/**
 * Static belt whose surface drags what lies on it, driven by a pinned wheel (belt anchor):
 * each step surfaceSpeed = wheel angular velocity × 20, so a clockwise wheel moves things right.
 */
export const conveyor: PartDef = {
  kind: 'conveyor',
  label: 'Tapis roulant',
  size: { w: 6, h: 1 },
  rotStep: 0,
  flippable: false,
  settings: [],
  anchors: [{ key: 'belt', local: WHEEL_AT, role: 'belt' }],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const c = poseOf(s)
    const hw = W / 2 - H / 2
    const hh = H / 2
    pen.line(v(c.x - hw, c.y - hh), v(c.x + hw, c.y - hh))
    pen.line(v(c.x - hw, c.y + hh), v(c.x + hw, c.y + hh))
    pen.circle(v(c.x + hw, c.y), hh)
    const w = s.inst ? poseOf(s, 1) : { ...add(c, WHEEL_AT), angle: 0 }
    pen.circle(w, hh)
    pen.circle(w, 2)
    pen.line(v(w.x, w.y), v(w.x + (hh - 2) * Math.cos(w.angle), w.y + (hh - 2) * Math.sin(w.angle)))
    // Tread marks slide with the wheel's turn.
    const phase = ((((w.angle * SPEED_PER_RAD) % 20) + 20) % 20)
    for (let x = -hw + phase; x < hw; x += 20) pen.line(v(c.x + x, c.y - hh - 2), v(c.x + x + 6, c.y - hh - 2))
  },
  build({ world }, p) {
    const belt = staticBox(world, pos(p), v(W, H), 0, {
      friction: 0.8,
      data: { part: p.id, tags: ['conveyor'] },
    })
    // A sensor, so it turns freely inside the belt and only drives it through the belt link.
    const wheel = dynamicCircle(world, add(pos(p), WHEEL_AT), WHEEL_R, {
      density: DENSITY,
      sensor: true,
      bullet: false,
      data: { part: p.id, tags: ['conveyor-wheel'] },
    })
    const j = pin(world, wheel, add(pos(p), WHEEL_AT))
    const inst = instance(p, [belt, wheel], { belt: { body: wheel, local: v(0, 0), radius: WHEEL_R, pin: j } })
    inst.onStep = (sim) => {
      const speed = wheel.getAngularVelocity() * SPEED_PER_RAD
      data(belt).surfaceSpeed = speed
      // A moving belt wakes what rests on it, or a body that fell asleep there would never be dragged.
      if (speed !== 0) for (const t of touching(belt)) t.other.setAwake(true)
      if (Math.abs(speed) > 1) sim.activate(inst)
    }
    return inst
  },
}
