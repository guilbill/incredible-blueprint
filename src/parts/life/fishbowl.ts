import { dynamicBox, setEnabled } from '../../engine/bodies'
import { type Vec, v } from '../../engine/vec'
import { bodyPose } from '../../engine/world'
import { CELL, DENSITY, instance, pos } from '../common'
import { applyGlow, arcPts, poseOf, toWorld } from '../drawing'
import type { PartDef, SimCtx } from '../types'

const SIZE = 2 * CELL
const FISH = v(14, 8)
/** Contact impulse (kg·units/s) that breaks the bowl. */
const BREAK_HIT = 80
/** cos(60°): tilted further than 60° the bowl breaks. */
const TILT_COS = 0.5

/**
 * Dynamic fishbowl (2 × 2). A hit of impulse > 80 or a tilt beyond 60° breaks it once
 * (`bowl-broken`): the glass leaves the simulation and a fish body (bodies[1], tag `fish`) is
 * created at its centre, a target for cats.
 */
export const fishbowl: PartDef = {
  kind: 'fishbowl',
  label: 'Bocal à poisson',
  size: { w: 2, h: 2 },
  rotStep: 0,
  flippable: false,
  settings: [],
  anchors: [],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const bowl = poseOf(s)
    const W = (pts: Vec[]) => toWorld(bowl, pts)
    const broken = !!s.inst?.state.broken
    // Round glass of radius 19 around (0, 1), open from the rim (y -16) to the foot (y 18).
    const rim = Math.asin(-15 / 19)
    const foot = Math.asin(17 / 19)
    if (broken) {
      // what is left of the wall, and shards where the bowl stood
      pen.path(W(arcPts(0, 1, 19, 19, 0.6, foot, 4)))
      pen.path(W(arcPts(0, 1, 19, 19, Math.PI - foot, Math.PI - 0.7, 4)))
      pen.poly(W([v(-4, 20), v(-1, 14), v(3, 20)]))
      pen.poly(W([v(5, 20), v(8, 16), v(9, 20)]))
    } else {
      pen.path(W([v(14, -16), ...arcPts(0, 1, 19, 19, rim, foot, 10), ...arcPts(0, 1, 19, 19, Math.PI - foot, Math.PI - rim, 10), v(-14, -16)]))
      const [a, b] = W([v(-16.5, -6), v(16.5, -6)])
      pen.line(a, b)
      // Bubbles stay under the water line (y -6), drawn in the bowl's frame so they tilt with it.
      pen.circle(W([v(5, -1)])[0], 1.2)
      pen.circle(W([v(8, -3.5)])[0], 1.6)
    }
    if (s.inst?.state.fishEaten) return
    const f = broken && s.inst ? bodyPose(s.inst.bodies[1]) : { ...bowl, y: bowl.y + 4 }
    const F = (pts: Vec[]) => toWorld(f, pts)
    pen.path(F([v(-3, 0), v(0, -3.5), v(4, -2), v(6, 0), v(4, 2), v(0, 3.5), v(-3, 0)]))
    pen.poly(F([v(-3, 0), v(-7, -3), v(-7, 3)]))
  },
  build({ world }, p) {
    const glass = dynamicBox(world, pos(p), v(SIZE, SIZE), 0, {
      density: 0.5 * DENSITY,
      friction: 0.5,
      data: { part: p.id, tags: ['fishbowl'] },
    })
    const inst = instance(p, [glass])
    inst.state.broken = 0
    inst.state.fishEaten = 0
    const shatter = (sim: SimCtx) => {
      if (inst.state.broken) return
      inst.state.broken = 1
      const at = bodyPose(glass)
      setEnabled(glass, false)
      const fish = dynamicBox(world, v(at.x, at.y), FISH, 0, {
        density: DENSITY,
        friction: 0.6,
        data: { part: p.id, tags: ['fish'] },
      })
      inst.bodies.push(fish)
      sim.activate(inst)
      sim.emit('bowl-broken', inst.id)
    }
    inst.onStep = (sim) => {
      if (!inst.state.broken && Math.cos(glass.getAngle()) < TILT_COS) shatter(sim)
    }
    inst.onContact = (ev, self, _other, sim) => {
      if (self === glass && !ev.began && ev.impulse > BREAK_HIT) shatter(sim)
    }
    return inst
  },
}
