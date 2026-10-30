import { applyImpulse, data, staticBox, touching } from '../../engine/bodies'
import { v } from '../../engine/vec'
import { CELL, instance } from '../common'
import { applyGlow } from '../drawing'
import type { PartDef } from '../types'
import { isFree, takeMouse } from './mouse'

/** Low plate (40 × 6) at the bottom of the 2 × 1 footprint: walkers see over it but cannot step on it. */
const PLATE = v(2 * CELL, 6)
const PLATE_Y = CELL / 2 - PLATE.y / 2
/** Upward speed (units/s) given to every dynamic body resting on the plate when the trap snaps. */
const THROW = 600

/**
 * Static mousetrap (2 × 1). A free mouse touching it springs it once: `trap-snapped`, the mouse is
 * held, and every dynamic body resting on the plate gets an impulse of (0, −600 × mass) (catapult).
 */
export const mousetrap: PartDef = {
  kind: 'mousetrap',
  label: 'Tapette à souris',
  size: { w: 2, h: 1 },
  rotStep: 0,
  flippable: false,
  settings: [],
  anchors: [],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const { x, y } = s.placement
    const top = y + PLATE_Y - PLATE.y / 2
    const P = (dx: number, dy: number) => v(x + dx, top + dy)
    // plate and the spring eye at the hinge
    pen.poly([P(-CELL, 0), P(CELL, 0), P(CELL, PLATE.y), P(-CELL, PLATE.y)])
    pen.circle(P(0, -3), 3)
    if (s.inst?.state.snapped) {
      pen.path([P(0, -3), P(17, -1.5), P(17, 0)])
      pen.poly([P(5, -1.5), P(12, -1.5), P(12, 0), P(5, 0)])
    } else {
      // the bar, cocked back with its bail, and the bait pedal
      pen.path([P(0, -3), P(-16, -13), P(-18, -10)])
      pen.poly([P(7, -2.5), P(14, -2.5), P(14, 0), P(7, 0)])
      pen.circle(P(10.5, -4.5), 1.5)
    }
  },
  build({ world }, p) {
    const plate = staticBox(world, v(p.x, p.y + PLATE_Y), PLATE, 0, {
      friction: 0.5,
      data: { part: p.id, tags: ['mousetrap', 'metal'] },
    })
    const inst = instance(p, [plate])
    inst.state.snapped = 0
    inst.onContact = (_ev, self, other, sim) => {
      if (self !== plate || inst.state.snapped || !data(other).tags.includes('mouse')) return
      const m = sim.part(data(other).part ?? '')
      if (!m || !isFree(m)) return
      inst.state.snapped = 1
      takeMouse(m, 'held')
      sim.activate(inst)
      sim.emit('trap-snapped', inst.id)
      for (const b of sim.world.bodies()) {
        if (!b.isDynamic() || !b.isActive()) continue
        if (!touching(b).some((t) => t.other === plate && t.normal.y < -0.5)) continue
        applyImpulse(b, v(0, -THROW * b.getMass()))
      }
    }
    return inst
  },
}
