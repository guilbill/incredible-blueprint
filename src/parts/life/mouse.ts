import type { Body } from 'planck'
import { data, dynamicBox, setEnabled } from '../../engine/bodies'
import { v } from '../../engine/vec'
import { bodyPose } from '../../engine/world'
import { CELL, DENSITY, instance, pos } from '../common'
import { applyGlow, poseOf } from '../drawing'
import type { PartDef, PartInstance, SimCtx } from '../types'
import { bodiesOf, blocked, centre, nearestSeen, walk } from './walker'

const SIZE = CELL
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
    const X = (x: number) => p.x + x * d
    // body, head, ear, eye, tail and legs
    pen.path([v(X(-9), p.y + 8), v(X(-8), p.y - 2), v(X(0), p.y - 6), v(X(6), p.y - 3), v(X(10), p.y + 6), v(X(-9), p.y + 8)])
    pen.circle(v(X(2), p.y - 7), 3)
    pen.circle(v(X(6), p.y - 1), 1)
    pen.path([v(X(-9), p.y + 6), v(X(-14), p.y + 2), v(X(-17), p.y + 6)])
    pen.line(v(X(-5), p.y + 8), v(X(-5), p.y + 10))
    pen.line(v(X(5), p.y + 8), v(X(5), p.y + 10))
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
