import { v } from '../../engine/vec'
import { CELL } from '../common'
import { applyGlow, poseOf, rectPts, toWorld } from '../drawing'
import type { PartDef } from '../types'
import { MOTOR_TORQUE, WHEEL_R, buildDrive } from './drive'

const W = 3 * CELL
const H = 2 * CELL

/** Monkey on a bike: slow (3 rad/s) but strong (3T) once hit. Belt on the wheel. */
export const monkeyBike: PartDef = {
  kind: 'monkey-bike',
  label: 'Singe à vélo',
  size: { w: 3, h: 2 },
  rotStep: 0,
  flippable: true,
  settings: [],
  anchors: [{ key: 'belt', local: v(0, 0), role: 'belt', radius: WHEEL_R }],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const frame = { x: s.placement.x, y: s.placement.y, angle: 0 }
    pen.poly(toWorld(frame, rectPts(W, H)))
    const wheel = poseOf(s, 1)
    const R = WHEEL_R - 8
    pen.circle(wheel, R)
    for (let k = 0; k < 3; k++) {
      const [p, q] = toWorld({ ...wheel, angle: wheel.angle + (k * Math.PI) / 3 }, [v(-R, 0), v(R, 0)])
      pen.line(p, q)
    }
    // the monkey, sat above the wheel, hands on the handlebar, one foot on the turning pedal
    const sx = s.placement.flip ? -1 : 1
    const P = (x: number, y: number) => toWorld(frame, [v(x * sx, y)])[0]
    pen.line(P(16, 12), P(18, -14))
    pen.line(P(14, -14), P(22, -14))
    pen.circle(P(-10, -12), 5)
    pen.circle(P(-14, -16), 2)
    pen.line(P(-8, -7), P(-4, 0))
    pen.line(P(-7, -5), P(16, -13))
    pen.line(P(-4, 0), toWorld(wheel, [v(6, 0)])[0])
    pen.path([P(-4, 0), P(-14, 2), P(-18, -4)])
  },
  build({ world }, p) {
    return buildDrive(world, p, { w: W, h: H, speed: 3, torque: 3 * MOTOR_TORQUE, tag: 'monkey-bike' }, false)
  },
}
