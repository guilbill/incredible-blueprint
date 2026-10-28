import { v } from '../../engine/vec'
import { CELL, setting } from '../common'
import { applyGlow, poseOf, rectPts, toWorld } from '../drawing'
import type { PartDef, SettingDef } from '../types'
import { MOTOR_TORQUE, WHEEL_R, buildDrive } from './drive'

const SIZE = 3 * CELL
const START: SettingDef = { key: 'start', label: 'Départ (0 = au choc, 1 = immédiat)', min: 0, max: 1, step: 1, def: 0 }

/** Mouse in a wheel: 6 rad/s with torque T once hit (or at once with start = 1). Belt on the wheel. */
export const mouseCage: PartDef = {
  kind: 'mouse-cage',
  label: 'Cage à souris',
  size: { w: 3, h: 3 },
  rotStep: 0,
  flippable: true,
  settings: [START],
  anchors: [{ key: 'belt', local: v(0, 0), role: 'belt' }],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const frame = { x: s.placement.x, y: s.placement.y, angle: 0 }
    pen.poly(toWorld(frame, rectPts(SIZE, SIZE)))
    // cage bars
    for (let i = 1; i < 6; i++) {
      const x = -SIZE / 2 + (i * SIZE) / 6
      const [a, b] = toWorld(frame, [v(x, -SIZE / 2), v(x, -SIZE / 2 + 6)])
      pen.line(a, b)
    }
    const wheel = poseOf(s, 1)
    pen.circle(wheel, WHEEL_R)
    for (let k = 0; k < 4; k++) {
      const a = wheel.angle + (k * Math.PI) / 4
      const [p, q] = toWorld({ ...wheel, angle: a }, [v(-WHEEL_R, 0), v(WHEEL_R, 0)])
      pen.line(p, q)
    }
    // the mouse, at the bottom of the wheel
    const m = v(wheel.x, wheel.y + WHEEL_R - 6)
    pen.circle(m, 4)
    pen.line(v(m.x + 4, m.y), v(m.x + 9, m.y - 2))
    pen.circle(v(m.x - 4, m.y - 4), 1.5)
  },
  build({ world }, p) {
    return buildDrive(world, p, { w: SIZE, h: SIZE, speed: 6, torque: MOTOR_TORQUE, tag: 'mouse-cage' }, setting(p, START) === 1)
  },
}
