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
    pen.poly([v(x - CELL, top), v(x + CELL, top), v(x + CELL, y + CELL / 2), v(x - CELL, y + CELL / 2)])
    pen.circle(v(x, top - 2), 2)
    if (s.inst?.state.snapped) {
      pen.line(v(x, top - 1), v(x + CELL - 2, top - 1))
    } else {
      // the bar, cocked back over the spring, and the bait pedal
      pen.path([v(x, top - 2), v(x - CELL + 2, top - 14), v(x - CELL + 4, top - 1)])
      pen.line(v(x + 6, top - 1), v(x + 14, top - 3))
    }
  },
  build({ world }, p) {
    const plate = staticBox(world, v(p.x, p.y + PLATE_Y), PLATE, 0, {
      friction: 0.5,
      data: { part: p.id, tags: ['mousetrap'] },
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
