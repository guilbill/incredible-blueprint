import type { Body } from 'planck'
import { data, dynamicBox, setEnabled } from '../../engine/bodies'
import { type Vec, v } from '../../engine/vec'
import { CELL, DENSITY, instance, pos } from '../common'
import { applyGlow, arcPts, poseOf } from '../drawing'
import type { PartDef, PartInstance, SimCtx } from '../types'
import { isFree, takeMouse } from './mouse'
import { bodiesOf, blocked, centre, nearestSeen, walk } from './walker'

const SIZE = 2 * CELL
const PI = Math.PI
export const SPEED = 100
/** Contact impulse (kg·units/s) that wakes the cat. */
const WAKE_HIT = 50
/** A mouse in sight closer than this (units) wakes the cat. */
const WAKE_SIGHT = 8 * CELL
/** Closer than this (units, horizontally) the cat stops walking toward its target. */
const NEAR = 1

const freeMice = (sim: SimCtx): Body[] => bodiesOf(sim, 'mouse', isFree)
/** Fish of broken bowls, not eaten yet. */
const fish = (sim: SimCtx): Body[] =>
  sim.parts.filter((p) => p.kind === 'fishbowl' && p.state.broken && !p.state.fishEaten).map((p) => p.bodies[1])

/**
 * Cat (2 × 2). Asleep until a hit of impulse > 50 or a mouse in sight within 8 cells. Awake, it
 * walks at 100 units/s toward the nearest mouse it sees, else the fish of a broken bowl it sees;
 * a wall in its way stops it (`state.sitting`), it never turns back. Touching a free mouse catches
 * it (`mouse-caught`, emitted for the mouse); touching a fish eats it.
 */
export const cat: PartDef = {
  kind: 'cat',
  label: 'Chat',
  size: { w: 2, h: 2 },
  rotStep: 0,
  flippable: true,
  settings: [],
  anchors: [],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const p = poseOf(s)
    const d = s.inst ? s.inst.state.dir : s.placement.flip ? -1 : 1
    const P = (x: number, y: number) => v(p.x + x * d, p.y + y)
    const L = (pts: Vec[]) => pts.map((q) => P(q.x, q.y))
    const awake = !!s.inst?.state.awake
    if (!awake) {
      // curled loaf: back dome, head tucked in front, tail wrapped under
      pen.path(L([...arcPts(-2, 20, 17, 17, PI, PI * 1.8), v(18, 20), v(-19, 20)]))
      pen.circle(P(11, 11), 7)
      pen.path(L([v(6, 6), v(6, -1), v(10, 4)]))
      pen.path(L([v(13, 4), v(17, 0), v(17.5, 8)]))
      pen.path(L(arcPts(13, 11, 2.5, 1.5, 0, PI, 6)))
      pen.path(L(arcPts(0, 12, 16, 6, PI * 0.95, PI * 0.35)))
      pen.label('z', P(17, -4))
      return
    }
    // walking profile: body, head with ears and eye, alternating legs, tail
    const walking = !s.inst?.state.sitting
    const sw = walking ? 3 * Math.sin(p.x * 0.3) : 0
    pen.poly(L(arcPts(-3, 4, 15, 7, 0, PI * 2, 20)))
    pen.circle(P(12, -6), 7)
    pen.path(L([v(7, -11), v(7, -18), v(11, -12.5)]))
    pen.path(L([v(13, -12.8), v(17, -17), v(18, -9)]))
    pen.circle(P(14, -7), 1.2)
    for (const [x, k] of [[6, 1], [1, -1], [-9, -1], [-14, 1]]) pen.line(P(x, 10), P(x + k * sw, 20))
    pen.path(L(arcPts(-8, 4, 10, 18, PI, PI * 1.38)))
  },
  build({ world }, p) {
    const b = dynamicBox(world, pos(p), v(SIZE, SIZE), 0, {
      density: DENSITY,
      friction: 0.3,
      data: { part: p.id, tags: ['cat'] },
    })
    b.setFixedRotation(true)
    const inst = instance(p, [b])
    inst.state.awake = 0
    inst.state.sitting = 0
    inst.state.dir = p.flip ? -1 : 1
    inst.onStep = (sim) => {
      if (!inst.state.awake && nearestSeen(b, freeMice(sim), sim, WAKE_SIGHT)) inst.state.awake = 1
      if (inst.state.awake) chase(inst, b, sim)
    }
    inst.onContact = (ev, self, other, sim) => {
      if (self !== b) return
      if (!ev.began && ev.impulse > WAKE_HIT && !inst.state.awake) {
        inst.state.awake = 1
        sim.activate(inst)
      }
      if (!inst.state.awake) return
      const tags = data(other).tags
      const owner = sim.part(data(other).part ?? '')
      if (!owner) return
      if (tags.includes('mouse') && isFree(owner)) {
        takeMouse(owner, 'caught')
        sim.activate(inst)
        sim.emit('mouse-caught', owner.id)
      } else if (tags.includes('fish') && !owner.state.fishEaten) {
        owner.state.fishEaten = 1
        setEnabled(other, false)
        sim.activate(inst)
      }
    }
    return inst
  },
}

function chase(inst: PartInstance, b: Body, sim: SimCtx): void {
  const target = nearestSeen(b, freeMice(sim), sim) ?? nearestSeen(b, fish(sim), sim)
  const dx = target ? centre(target).x - centre(b).x : 0
  if (Math.abs(dx) < NEAR) {
    inst.state.sitting = 1
    walk(b, 0, 0)
    return
  }
  const dir = dx > 0 ? 1 : -1
  inst.state.dir = dir
  inst.state.sitting = blocked(b, dir, sim) ? 1 : 0
  walk(b, inst.state.sitting ? 0 : dir, SPEED)
  sim.activate(inst)
}
