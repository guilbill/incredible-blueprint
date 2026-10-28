import { applyForce, centreOf, data, staticBox } from '../../engine/bodies'
import { len, scale, sub, v } from '../../engine/vec'
import { CELL, angleOf, instance, pos, setting } from '../common'
import { applyGlow, poseOf, toWorld } from '../drawing'
import type { PartDef, SettingDef } from '../types'

const POWER: SettingDef = { key: 'power', label: 'Puissance', min: 1, max: 5, step: 1, def: 3 }
/** Reach in units (6 cells). */
const REACH = 6 * CELL
/** Force per unit of power, in multiples of the body's mass (units/s²), at zero distance. */
const PULL = 4000

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
    const W = (pts: { x: number; y: number }[]) => toWorld(pose, pts)
    // U lying on its side, poles to the right
    pen.path(W([v(20, -10), v(-10, -10), v(-20, -4), v(-20, 4), v(-10, 10), v(20, 10)]))
    pen.path(W([v(20, -3), v(-8, -3), v(-12, 0), v(-8, 3), v(20, 3)]))
    for (const y of [-10, 10]) {
      const [a, b] = W([v(12, y), v(12, y < 0 ? -3 : 3)])
      pen.line(a, b)
    }
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
