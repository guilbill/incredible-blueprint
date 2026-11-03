import { applyForce, centreOf, data, outlines, staticBox } from '../../engine/bodies'
import { type Vec, add, len, rotate, scale, sub, v } from '../../engine/vec'
import { CELL, angleOf, instance, pos, setting } from '../common'
import { COLORS } from '../../render/pen'
import { applyGlow, arcPts, poseOf, toWorld } from '../drawing'
import type { PartDef, SettingDef } from '../types'
import { isPressed } from './button'

const POWER: SettingDef = { key: 'power', label: 'Puissance', min: 1, max: 5, step: 1, def: 3 }
/** The poles, in the magnet's frame: the field starts there and points along +x. */
const POLES = v(20, 0)
/** Reach in units in front of the poles (7 cells). */
const REACH = 7 * CELL
/** Half-width of the field per unit ahead (±35°), plus the poles' own half-height. */
const SPREAD = 0.7
const POLE_HALF = 6
/** Half-angle of the drawn waves (atan SPREAD). */
const WAVE_ANGLE = 0.61
/** Force per unit of power, in multiples of the body's mass (units/s²), at the poles. Power 2 cannot pull a bar out from under a bowling ball; power 3 can. */
const PULL = 700
/** Waves leave the poles every 1/WAVES of a cycle; a cycle lasts 200 steps. */
const WAVES = 4
const WAVE_STEPS = 200

/** Field strength 0..1 at a point in the magnet's frame: 0 behind the poles, outside ±35° or beyond the reach. */
function fieldAt(l: Vec): number {
  const dx = l.x - POLES.x
  if (dx <= 0 || Math.abs(l.y) > dx * SPREAD + POLE_HALF) return 0
  const d = len(v(dx, l.y))
  return d >= REACH ? 0 : 1 - d / REACH
}

/** Horseshoe outline lying on its side, poles to the right: outer radius 10, inner radius `inner`. */
const horseshoe = (inner: number): Vec[] => [
  v(20, -10),
  ...arcPts(-10, 0, 10, 10, -Math.PI / 2, -1.5 * Math.PI, 12),
  v(20, 10),
  v(20, inner),
  ...arcPts(-10, 0, inner, inner, Math.PI / 2, 1.5 * Math.PI, 8),
  v(20, -inner),
]

/**
 * Static horseshoe magnet (2 × 1), poles facing +x. Each step, every active dynamic body tagged
 * `metal` whose centre lies in front of the poles (within 7 cells and ±35°) gets a force toward the
 * poles of `power × 700 × mass × (1 − d / 140)`, and glows. Nothing behind or beside it is pulled.
 * `state.pulls` counts the steps it pulled something, `state.near` is how far ahead of the poles the
 * nearest caught part starts (−1 when none: the waves run to the full reach), `state.on` is 1 while
 * powered. Wired to buttons, it pulls only while one of them is pressed; unwired, it always pulls.
 */
export const magnet: PartDef = {
  kind: 'magnet',
  label: 'Aimant',
  size: { w: 2, h: 1 },
  rotStep: 6,
  flippable: false,
  settings: [POWER],
  anchors: [{ key: 'wire', local: v(-20, 0), role: 'wire' }],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const pose = poseOf(s)
    const W = (pts: Vec[]) => toWorld(pose, pts)
    pen.poly(W(horseshoe(3)))
    // Pole lines, + on the top pole and − on the bottom one.
    for (const y of [-1, 1]) {
      const [a, b] = W([v(13, 10 * y), v(13, 3 * y)])
      pen.line(a, b)
      const [h0, h1] = W([v(14.5, 6.5 * y), v(18.5, 6.5 * y)])
      pen.line(h0, h1)
      if (y < 0) {
        const [v0, v1] = W([v(16.5, -8.5), v(16.5, -4.5)])
        pen.line(v0, v1)
      }
    }
    // Field line between the poles; in front of them, waves while it is powered (a still fan when not running).
    const width = pen.ctx.lineWidth
    pen.ctx.lineWidth = 0.8
    pen.ctx.setLineDash([2, 2])
    pen.path(W(arcPts(20, 0, 2.5, 2.5, -Math.PI / 2, -1.5 * Math.PI, 8)))
    const wave = (r: number) => W(arcPts(POLES.x, 0, r, r * 0.9, -WAVE_ANGLE, WAVE_ANGLE, 14))
    const inst = s.inst
    if (!inst) {
      pen.ctx.globalAlpha = 0.35
      for (const r of [REACH / 3, (2 * REACH) / 3, REACH]) pen.path(wave(r))
    } else if (inst.state.on) {
      pen.reset(COLORS.cyan, 1.2)
      const near = inst.state.near
      for (let i = 0; i < WAVES; i++) {
        const ph = ((inst.state.t / WAVE_STEPS + i / WAVES) % 1 + 1) % 1
        const r = 8 + ph * (REACH - 8)
        const stopped = near >= 0 && r > near
        pen.ctx.globalAlpha = stopped ? 0.12 : 0.15 + 0.7 * (1 - ph)
        pen.ctx.lineWidth = stopped ? 0.8 : 1.2
        pen.path(wave(r))
      }
    }
    pen.ctx.globalAlpha = 1
    pen.ctx.setLineDash([])
    pen.ctx.lineWidth = width
  },
  build({ world }, p) {
    const b = staticBox(world, pos(p), v(2 * CELL, CELL), angleOf(p), {
      friction: 0.6,
      data: { part: p.id, tags: ['magnet'] },
    })
    const inst = instance(p, [b], { wire: { body: b, local: v(-20, 0), radius: 0 } })
    const power = setting(p, POWER)
    const at = pos(p)
    const angle = angleOf(p)
    const poles = add(at, rotate(POLES, angle))
    const local = (w: Vec) => rotate(sub(w, at), -angle)
    inst.state.pulls = 0
    inst.state.near = -1
    inst.state.on = 0
    inst.state.t = 0
    inst.onStep = (sim) => {
      inst.state.t = sim.step
      inst.state.on = !inst.wires?.length || inst.wires.some((id) => isPressed(sim.part(id))) ? 1 : 0
      inst.state.near = -1
      if (!inst.state.on) return
      let pulled = false
      for (const o of sim.world.bodies()) {
        if (!o.isDynamic() || !o.isActive() || !data(o).tags.includes('metal')) continue
        const g = fieldAt(local(centreOf(o)))
        if (g <= 0) continue
        const to = sub(poles, centreOf(o))
        applyForce(o, scale(to, (power * PULL * o.getMass() * g) / len(to)))
        pulled = true
        // How far ahead of the poles this part starts: the waves stop there.
        let ahead = Infinity
        for (const ol of outlines(o)) {
          if (ol.kind === 'circle') ahead = Math.min(ahead, local(ol.c).x - ol.r)
          else for (const q of ol.pts) ahead = Math.min(ahead, local(q).x)
        }
        ahead -= POLES.x
        if (inst.state.near < 0 || ahead < inst.state.near) inst.state.near = Math.max(0, ahead)
        const owner = data(o).part
        const part = owner === null ? undefined : sim.part(owner)
        if (part) sim.activate(part)
      }
      if (!pulled) return
      inst.state.pulls++
      sim.activate(inst)
    }
    return inst
  },
}
