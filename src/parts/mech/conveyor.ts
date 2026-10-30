import { data, dynamicCircle, staticBox, touching } from '../../engine/bodies'
import { pin } from '../../engine/joints'
import { type Vec, add, v } from '../../engine/vec'
import { CELL, DENSITY, instance, pos } from '../common'
import { applyGlow, arcPts, poseOf, toWorld } from '../drawing'
import type { PartDef } from '../types'

const W = 6 * CELL
const H = CELL
/** Drive wheel, inside the left end of the belt. */
const WHEEL_R = H / 2
const WHEEL_AT = v(-W / 2 + WHEEL_R, 0)
/** Surface speed (units/s) per rad/s of the drive wheel. */
const SPEED_PER_RAD = 20

/** Closed belt loop: two straight runs of half length hw joined by half circles of radius r. */
const loopPts = (hw: number, r: number): Vec[] => [
  ...arcPts(hw, 0, r, r, -Math.PI / 2, Math.PI / 2),
  ...arcPts(-hw, 0, r, r, Math.PI / 2, (3 * Math.PI) / 2),
]

/** Belt travel (units) mod `step`, from the wheel's turn. */
const travel = (angle: number, step: number): number => (((angle * SPEED_PER_RAD) % step) + step) % step

/** Sprocket outline of `teeth` teeth between radii r0 and r1, turned by angle. */
function sprocket(at: Vec, r0: number, r1: number, teeth: number, angle: number): Vec[] {
  const pts: Vec[] = []
  for (let i = 0; i < teeth * 4; i++) {
    const a = angle + (i * Math.PI) / (teeth * 2)
    const r = i % 4 < 2 ? r1 : r0
    pts.push(v(at.x + r * Math.cos(a), at.y + r * Math.sin(a)))
  }
  return pts
}

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
  anchors: [{ key: 'belt', local: WHEEL_AT, role: 'belt', radius: WHEEL_R }],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const c = poseOf(s)
    const hw = W / 2 - H / 2
    const hh = H / 2
    const W2 = (pts: Vec[]): Vec[] => toWorld(c, pts)
    pen.poly(W2(loopPts(hw, hh)))
    pen.poly(W2(loopPts(hw, hh - 3.5)))
    // Plates across the tread, both runs, sliding with the wheel's turn.
    const w = s.inst ? poseOf(s, 1) : { ...add(c, WHEEL_AT), angle: 0 }
    const phase = travel(w.angle, 6)
    for (let x = -hw + phase; x < hw; x += 6) pen.line(...(W2([v(x, -hh), v(x, -hh + 3.5)]) as [Vec, Vec]))
    for (let x = hw - phase; x > -hw; x -= 6) pen.line(...(W2([v(x, hh), v(x, hh - 3.5)]) as [Vec, Vec]))
    const [idler] = W2([v(hw, 0)])
    for (const at of [v(w.x, w.y), idler]) {
      pen.poly(sprocket(at, 4.6, 5.8, 8, w.angle))
      pen.circle(at, 1.6)
    }
    // Crank pin on the drive sprocket shows which way it turns.
    pen.circle(v(w.x + 3.3 * Math.cos(w.angle), w.y + 3.3 * Math.sin(w.angle)), 0.8)
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
      if (Math.abs(speed) > 1e-3) for (const t of touching(belt)) t.other.setAwake(true)
      if (Math.abs(speed) > 1) sim.activate(inst)
    }
    return inst
  },
}
