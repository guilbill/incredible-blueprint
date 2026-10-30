import { type Vec, v } from '../../engine/vec'
import { COLORS, type Pen } from '../../render/pen'
import { CELL } from '../common'
import { applyGlow, arcPts, hatch, poseOf, rectPts, toWorld } from '../drawing'
import type { PartDef } from '../types'
import { MOTOR_TORQUE, WHEEL_R, buildDrive } from './drive'

const W = 3 * CELL
const H = 2 * CELL
const PI = Math.PI

/** Knee of a two-segment limb (segments of length l) from hip h to foot f; bend +1 pushes it to +x (local). */
function knee(h: Vec, f: Vec, l: number, bend: number): Vec {
  const dx = f.x - h.x
  const dy = f.y - h.y
  const d = Math.sqrt(dx * dx + dy * dy) || 1
  const off = d < 2 * l ? Math.sqrt(l * l - (d * d) / 4) : 0
  return v((h.x + f.x) / 2 + (dy / d) * off * bend, (h.y + f.y) / 2 - (dx / d) * off * bend)
}

/** Local points on a spiral from (r0, a0) to (r1, a1) around c. */
const spiralPts = (cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, n: number): Vec[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const a = a0 + (a1 - a0) * t
    const r = r0 + (r1 - r0) * t
    return v(cx + r * Math.cos(a), cy + r * Math.sin(a))
  })

/** Local points of an ellipse centred on c, tilted by `tilt`. */
const ovalPts = (cx: number, cy: number, rx: number, ry: number, tilt: number, n = 16): Vec[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i * 2 * PI) / n
    const x = rx * Math.cos(a)
    const y = ry * Math.sin(a)
    return v(cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt))
  })

/** A wheel: tyre and `n` spokes across the hub at angle `ang`. */
function wheel(pen: Pen, L: (p: Vec[]) => Vec[], c: Vec, r: number, ang: number, n: number): void {
  pen.poly(L(arcPts(c.x, c.y, r, r, 0, 2 * PI, 20).slice(0, 20)))
  const w = pen.ctx.lineWidth
  pen.ctx.lineWidth = 0.8
  for (let k = 0; k < n; k++) {
    const t = ang + (k * PI) / n
    pen.path(L([v(c.x + r * Math.cos(t), c.y + r * Math.sin(t)), v(c.x - r * Math.cos(t), c.y - r * Math.sin(t))]))
  }
  pen.ctx.lineWidth = w
}

/** Arc of an ear of radius re centred d from a head of radius rh, outside the head only; `side` -1 left, 1 right. */
function earPts(hc: Vec, rh: number, re: number, d: number, side: number): Vec[] {
  const c = v(hc.x + side * d, hc.y)
  const x = (d * d + re * re - rh * rh) / (2 * d)
  const cut = Math.acos(Math.max(-1, Math.min(1, x / re)))
  const toward = side < 0 ? 0 : PI
  return arcPts(c.x, c.y, re, re, toward + cut, toward + 2 * PI - cut, 12)
}

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
    const thin = (on: boolean) => {
      pen.reset(COLORS.line, on ? 0.8 : 1.5)
      applyGlow(pen, s)
    }
    thin(false)
    // local coords with +x towards the handlebar (mirrored when flipped); `a` turns the wheels forward either way
    const frame = { x: s.placement.x, y: s.placement.y, angle: 0 }
    const sx = s.placement.flip ? -1 : 1
    const L = (pts: Vec[]) => toWorld(frame, pts.map((q) => v(q.x * sx, q.y)))
    const P = (x: number, y: number) => L([v(x, y)])[0]
    const a = poseOf(s, 1).angle * sx
    const at = (c: Vec, r: number, ang: number) => v(c.x + r * Math.cos(ang), c.y + r * Math.sin(ang))
    pen.poly(toWorld(frame, rectPts(W, H)))
    // hatched plinth
    pen.line(P(-W / 2, 17), P(W / 2, 17))
    hatch(pen, { x: frame.x, y: frame.y + 18.5, angle: 0 }, W, 3, 2.5)
    // kid bike: wheels, stabiliser on its strut
    wheel(pen, L, v(-17, 9), 8, a, 3)
    wheel(pen, L, v(17, 9), 8, a, 3)
    thin(true)
    pen.line(P(-17, 9), P(-24.5, 13.5))
    pen.circle(P(-24.5, 13.5), 3.5)
    pen.circle(P(-24.5, 13.5), 0.8)
    thin(false)
    // step-through frame, high bar, saddle, turning crank
    const crank = v(0, 9)
    pen.path(L([v(-17, 9), crank, v(-7, -3)]))
    pen.path(L([v(-17, 9), v(-7, -3)]))
    pen.path(L([crank, v(11, 0), v(17, 9)]))
    pen.path(L([v(11, 0), v(10, -9), v(14, -9)]))
    pen.line(P(-10, -4.5), P(-4.5, -4.5))
    pen.circle(P(crank.x, crank.y), 2)
    const pedal = at(crank, 4, a)
    const far = at(crank, 4, a + PI)
    pen.line(P(far.x, far.y), P(pedal.x, pedal.y))
    // the monkey: jointed limbs, spiral tail, round head, ears, face disc with muzzle
    const hip = v(-7, -6.5)
    const sh = v(-1.5, -10)
    const grip = v(13.5, -9)
    const kf = knee(hip, far, 9.5, 1)
    const kn = knee(hip, pedal, 9.5, 1)
    const el = knee(sh, grip, 8, -1)
    thin(true)
    pen.path(L([hip, kf, far]))
    thin(false)
    pen.path(L([hip, kn, pedal]))
    pen.path(L([sh, el, grip]))
    pen.path(L([hip, sh]))
    thin(true)
    pen.poly(L(ovalPts(-4.2, -8.3, 4.6, 2.6, -0.55)))
    thin(false)
    pen.path(L([v(-9, -6), ...spiralPts(-18, -6, 8, 1.2, 0, -1.7 * PI, 20)]))
    for (const j of [hip, sh, kn, el]) pen.circle(P(j.x, j.y), 0.9)
    const hc = v(4, -14.5)
    pen.circle(P(hc.x, hc.y), 4.8)
    pen.path(L(earPts(hc, 4.8, 2.3, 5.4, -1)))
    pen.path(L(earPts(hc, 4.8, 2.3, 5.4, 1)))
    thin(true)
    pen.circle(P(hc.x + 0.8, hc.y + 0.4), 3.2)
    pen.line(P(hc.x - 1.8, hc.y + 1.6), P(hc.x + 3.6, hc.y + 1.6))
    thin(false)
    for (const ex of [-0.4, 2.2]) pen.circle(P(hc.x + ex, hc.y - 0.8), 0.4)
    pen.path(L(arcPts(hc.x + 0.9, hc.y + 1.6, 1.6, 1.1, 0, PI, 6)))
  },
  build({ world }, p) {
    return buildDrive(world, p, { w: W, h: H, speed: 3, torque: 3 * MOTOR_TORQUE, tag: 'monkey-bike' }, false)
  },
}
