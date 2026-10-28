import { staticBox } from '../../engine/bodies'
import { v } from '../../engine/vec'
import { CELL, instance, pos } from '../common'
import type { PartDef } from '../types'

/** Static, 3 × 1 cells. Planck mixes restitution with max(), so anything landing on it bounces at 0.95. */
export const trampoline: PartDef = {
  kind: 'trampoline',
  label: 'Trampoline',
  size: { w: 3, h: 1 },
  rotStep: 0,
  flippable: false,
  settings: [],
  anchors: [],
  build({ world }, p) {
    const b = staticBox(world, pos(p), v(3 * CELL, CELL), 0, {
      friction: 0.5,
      restitution: 0.95,
      data: { part: p.id, tags: ['trampoline'] },
    })
    return instance(p, [b])
  },
}
