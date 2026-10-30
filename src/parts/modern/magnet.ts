import { applyForce, centreOf, data, staticBox } from '../../engine/bodies'
import { type Vec, len, scale, sub, v } from '../../engine/vec'
import { CELL, angleOf, instance, pos, setting } from '../common'
import { applyGlow, arcPts, poseOf, toWorld } from '../drawing'
import type { PartDef, SettingDef } from '../types'

const POWER: SettingDef = { key: 'power', label: 'Puissance', min: 1, max: 5, step: 1, def: 3 }
/** Reach in units (6 cells). */
const REACH = 6 * CELL
/** Force per unit of power, in multiples of the body's mass (units/s²), at zero distance. */
const PULL = 4000

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
 * Static horseshoe magnet (2 × 1). Each step, every active dynamic body tagged `metal` whose centre
 * is within 6 cells of the magnet's centre gets a force toward it of
 * `power × 4000 × mass × (1 − d / 120)` (`state.pulls` counts the steps it pulled something).
 */
export const magnet: PartDef = {
  kind: 'magnet',
  label: 'Aimant',
  size: { w: 2, h: 1 },
  rotStep: 6,
  flippable: false,
  settings: [POWER],
  anchors: [],
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
    // Field line between the poles, two more in front of them while it pulls.
    const width = pen.ctx.lineWidth
    pen.ctx.lineWidth = 0.8
    pen.ctx.setLineDash([2, 2])
    pen.path(W(arcPts(20, 0, 2.5, 2.5, -Math.PI / 2, -1.5 * Math.PI, 8)))
    if ((s.inst?.glow ?? 0) > 0) {
      for (const r of [5, 8]) pen.path(W(arcPts(20, 0, r, r, -Math.PI / 2, Math.PI / 2, 10)))
    }
    pen.ctx.setLineDash([])
    pen.ctx.lineWidth = width
  },
  build({ world }, p) {
    const b = staticBox(world, pos(p), v(2 * CELL, CELL), angleOf(p), {
      friction: 0.6,
      data: { part: p.id, tags: ['magnet'] },
    })
    const inst = instance(p, [b])
    const power = setting(p, POWER)
    const at = pos(p)
    inst.state.pulls = 0
    inst.onStep = (sim) => {
      let pulled = false
      for (const o of sim.world.bodies()) {
        if (!o.isDynamic() || !o.isActive() || !data(o).tags.includes('metal')) continue
        const to = sub(at, centreOf(o))
        const d = len(to)
        if (d >= REACH || d === 0) continue
        applyForce(o, scale(to, (power * PULL * o.getMass() * (1 - d / REACH)) / d))
        pulled = true
      }
      if (!pulled) return
      inst.state.pulls++
      sim.activate(inst)
    }
    return inst
  },
}
