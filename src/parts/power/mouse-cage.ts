import { type Vec, add, rotate, sub, v } from '../../engine/vec'
import type { Pen } from '../../render/pen'
import { CELL, setting } from '../common'
import { applyGlow, poseOf, rectPts, toWorld } from '../drawing'
import type { PartDef, SettingDef } from '../types'
import { MOTOR_TORQUE, WHEEL_R, buildDrive } from './drive'

const SIZE = 3 * CELL
const HALF = SIZE / 2

/** Local points of an ellipse centred on c, tilted by `tilt`. */
const ovalPts = (cx: number, cy: number, rx: number, ry: number, tilt = 0, n = 16): Vec[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i * 2 * Math.PI) / n
    const x = rx * Math.cos(a)
    const y = ry * Math.sin(a)
    return v(cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt))
  })

/** Rungs: short radial strokes between radii r0 and r1, `n` around the wheel. */
function rungs(pen: Pen, wheel: { x: number; y: number; angle: number }, r0: number, r1: number, n: number): void {
  for (let k = 0; k < n; k++) {
    const [p, q] = toWorld({ ...wheel, angle: wheel.angle + (k * 2 * Math.PI) / n }, [v(r0, 0), v(r1, 0)])
    pen.line(p, q)
  }
}
/**
 * Mouse sway on the rim, driven by the wheel angle (so it stops with the wheel): the wheel carries it
 * slowly up the rear, it scrambles forward past the bottom, then settles. One cycle per 19.2 rad
 * (3.2 s at 6 rad/s). Returns the angle around the axle (> 0 = towards the rear) and a body pitch.
 */
export function mouseSway(wheelAngle: number): { a: number; pitch: number } {
  const u = (Math.abs(wheelAngle) % 19.2) / 19.2
  let k: number
  if (u < 0.55) k = 0.5 - 0.5 * Math.cos((u / 0.55) * Math.PI)
  else if (u < 0.7) k = 1 - (1.35 * (u - 0.55)) / 0.15
  else {
    const t = (u - 0.7) / 0.3
    k = -0.35 * (1 - t) * (1 - t) * (1 - t) * Math.cos(t * Math.PI * 1.5)
  }
  return { a: 0.32 * k, pitch: k < 0 ? -0.08 : 0 }
}

const START: SettingDef = { key: 'start', label: 'Départ (0 = au choc, 1 = immédiat)', min: 0, max: 1, step: 1, def: 0 }

/** Mouse in a wheel: 6 rad/s with torque T once hit (or at once with start = 1). Belt on the wheel. */
export const mouseCage: PartDef = {
  kind: 'mouse-cage',
  label: 'Cage à souris',
  size: { w: 3, h: 3 },
  rotStep: 0,
  flippable: true,
  settings: [START],
  anchors: [{ key: 'belt', local: v(0, 0), role: 'belt', radius: WHEEL_R }],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const frame = { x: s.placement.x, y: s.placement.y, angle: 0 }
    pen.poly(toWorld(frame, rectPts(SIZE, SIZE)))
    const sx = s.placement.flip ? -1 : 1
    const L = (pts: Vec[]) => toWorld(frame, pts.map((q) => v(q.x * sx, q.y)))
    const P = (x: number, y: number) => L([v(x, y)])[0]
    // stand from the rim to the floor
    pen.line(P(-8, 17.3), P(-14, HALF))
    pen.line(P(8, 17.3), P(14, HALF))
    // wheel: two rims joined by rungs, three spokes
    const wheel = poseOf(s, 1)
    pen.circle(wheel, WHEEL_R - 1)
    pen.circle(wheel, WHEEL_R - 5)
    rungs(pen, wheel, WHEEL_R - 5, WHEEL_R - 1, 12)
    for (let k = 0; k < 3; k++) {
      const [p, q] = toWorld({ ...wheel, angle: wheel.angle + (k * 2 * Math.PI) / 3 }, [v(2, 0), v(WHEEL_R - 5, 0)])
      pen.line(p, q)
    }
    pen.circle(wheel, 2)
    // the mouse, running on the inner rim: pitched around its feet, then swayed around the axle
    const sway = mouseSway(wheel.angle)
    const feet = v(0, 14.8)
    const M = (pts: Vec[]) => L(pts.map((q) => rotate(add(feet, rotate(sub(q, feet), sway.pitch)), sway.a)))
    pen.poly(M(ovalPts(-0.5, 11.5, 5, 3.3)))
    pen.circle(M([v(5, 10.5)])[0], 2.4)
    pen.circle(M([v(3.8, 7.6)])[0], 1.4)
    pen.path(M([v(-5.5, 11.5), v(-8.5, 9.5), v(-11, 10.5), v(-12.5, 8)]))
  },
  build({ world }, p) {
    return buildDrive(world, p, { w: SIZE, h: SIZE, speed: 6, torque: MOTOR_TORQUE, tag: 'mouse-cage' }, setting(p, START) === 1)
  },
}
