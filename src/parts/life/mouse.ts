import type { Body } from 'planck'
import { data, dynamicBox, setEnabled } from '../../engine/bodies'
import { type Vec, v } from '../../engine/vec'
import { bodyPose } from '../../engine/world'
import { CELL, DENSITY, instance, pos } from '../common'
import { applyGlow, arcPts, poseOf } from '../drawing'
import type { PartDef, PartInstance, SimCtx } from '../types'
import { bodiesOf, blocked, centre, nearestSeen, walk } from './walker'

const SIZE = CELL
const PI = Math.PI
export const WALK = 80
export const FLEE = 120
/** A cat in sight closer than this (units) makes the mouse flee. */
const FEAR = 6 * CELL
/** Half size (units) of a mouse cage's frame: a mouse whose centre is inside one is not free. */
const CAGE_HALF = 1.5 * CELL

/** Takes a mouse out of play: `held` (in a trap or cage, still drawn) or `caught` (by a cat, gone). */
export function takeMouse(m: PartInstance, how: 'held' | 'caught'): void {
  m.state[how] = 1
  setEnabled(m.bodies[0], false)
}

export const isFree = (m: PartInstance): boolean => !m.state.held && !m.state.caught

/**
 * Mouse (1 × 1). Runs along the ground at 80 units/s, toward the nearest cheese it sees, else the
 * way it faces (flip = left), and turns around at a wall. A cat in sight within 6 cells makes it
 * flee at 120 units/s. Touching a cheese eats it (`cheese-eaten`, emitted for the cheese).
 * A mouse placed inside a mouse cage stays there, held.
 */
export const mouse: PartDef = {
  kind: 'mouse',
  label: 'Souris',
  size: { w: 1, h: 1 },
  rotStep: 0,
  flippable: true,
  settings: [],
  anchors: [],
  draw(pen, s) {
    if (s.inst?.state.caught) return
    pen.reset()
    applyGlow(pen, s)
    const p = poseOf(s)
    const d = s.inst ? s.inst.state.dir : s.placement.flip ? -1 : 1
    const P = (x: number, y: number) => v(p.x + x * d, p.y + y)
    const L = (pts: Vec[]) => pts.map((q) => P(q.x, q.y))
    // teardrop body, ear, eye (shut when held), curl of tail, speed strokes when fleeing
    pen.poly(L([...arcPts(-1, 10, 9, 9, PI, PI * 1.75), v(10, 8), v(9, 10)]))
    pen.circle(P(1, 0), 3)
    if (s.inst?.state.held) pen.line(P(4.5, 5), P(6.5, 5))
    else pen.circle(P(5.5, 5), 0.8)
    pen.path(L(arcPts(-10, 5, 4, 4, PI * 0.5, PI * 1.3, 8)))
    if (s.inst?.state.fleeing) {
      pen.line(P(-14, 0), P(-19, 0))
      pen.line(P(-13, 10), P(-18, 10))
    }
  },
  build({ world }, p) {
    const b = dynamicBox(world, pos(p), v(SIZE, SIZE), 0, {
      density: DENSITY,
      friction: 0.2,
      data: { part: p.id, tags: ['mouse'] },
    })
    b.setFixedRotation(true)
    const inst = instance(p, [b])
    inst.state.dir = p.flip ? -1 : 1
    inst.state.held = 0
    inst.state.caught = 0
    inst.state.fleeing = 0
    inst.state.checked = 0
    inst.onStep = (sim) => {
      if (!inst.state.checked) {
        inst.state.checked = 1
        if (inCage(b, sim)) takeMouse(inst, 'held')
      }
      if (!isFree(inst)) return
      step(inst, b, sim)
    }
    inst.onContact = (_ev, self, other, sim) => {
      if (self !== b || !isFree(inst) || !data(other).tags.includes('cheese')) return
      const cheese = sim.part(data(other).part ?? '')
      if (!cheese || cheese.state.eaten) return
      cheese.state.eaten = 1
      setEnabled(other, false)
      sim.activate(cheese)
      sim.activate(inst)
      sim.emit('cheese-eaten', cheese.id)
    }
    return inst
  },
}

function inCage(b: Body, sim: SimCtx): boolean {
  const me = centre(b)
  return bodiesOf(sim, 'mouse-cage').some((c) => {
    const p = bodyPose(c)
    return Math.abs(me.x - p.x) < CAGE_HALF && Math.abs(me.y - p.y) < CAGE_HALF
  })
}

function step(inst: PartInstance, b: Body, sim: SimCtx): void {
  const me = centre(b)
  const cat = nearestSeen(b, bodiesOf(sim, 'cat'), sim, FEAR)
  let dir: -1 | 1
  let speed = WALK
  if (cat) {
    dir = me.x < centre(cat).x ? -1 : 1
    speed = FLEE
  } else {
    const cheese = nearestSeen(b, bodiesOf(sim, 'cheese', (c) => !c.state.eaten), sim)
    const dx = cheese ? centre(cheese).x - me.x : 0
    dir = dx > 0 ? 1 : dx < 0 ? -1 : inst.state.dir > 0 ? 1 : -1
  }
  if (blocked(b, dir, sim)) dir = dir > 0 ? -1 : 1
  inst.state.dir = dir
  inst.state.fleeing = cat ? 1 : 0
  walk(b, dir, speed)
  sim.activate(inst)
}
