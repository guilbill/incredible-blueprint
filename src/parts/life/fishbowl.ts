import { dynamicBox, setEnabled } from '../../engine/bodies'
import { v } from '../../engine/vec'
import { bodyPose } from '../../engine/world'
import { CELL, DENSITY, instance, pos } from '../common'
import { applyGlow, poseOf, toWorld } from '../drawing'
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
    const W = (pts: { x: number; y: number }[]) => toWorld(bowl, pts)
    const broken = !!s.inst?.state.broken
    if (broken) {
      // shards where the bowl stood
      for (const x of [-14, -4, 8]) pen.path(W([v(x, 20), v(x + 4, 12), v(x + 8, 20)]))
    } else {
      pen.path(W([v(-12, -20), v(-19, -6), v(-17, 12), v(-10, 20), v(10, 20), v(17, 12), v(19, -6), v(12, -20)]))
      const [a, b] = W([v(-18, -8), v(18, -8)])
      pen.line(a, b)
    }
    if (s.inst?.state.fishEaten) return
    const f = broken && s.inst ? bodyPose(s.inst.bodies[1]) : { ...bowl, y: bowl.y + 4 }
    const F = (pts: { x: number; y: number }[]) => toWorld(f, pts)
    pen.poly(F([v(-4, 0), v(0, -4), v(5, 0), v(0, 4)]))
    pen.poly(F([v(-4, 0), v(-8, -3), v(-8, 3)]))
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
