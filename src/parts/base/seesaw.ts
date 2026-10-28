import { dynamicBox } from '../../engine/bodies'
import { pin } from '../../engine/joints'
import { v } from '../../engine/vec'
import { CELL, DENSITY, ROT_ANGLE, instance, pos } from '../common'
import type { PartDef } from '../types'

const LEN = 6 * CELL
const THICK = 10
/** ±15°: the plank ends move about 16 units, inside the 2-cell high footprint. */
const LIMIT = ROT_ANGLE

/** Dynamic plank pinned to the ground at its centre, tilt limited to ±15°. */
export const seesaw: PartDef = {
  kind: 'seesaw',
  label: 'Bascule',
  size: { w: 6, h: 2 },
  rotStep: 0,
  flippable: false,
  settings: [],
  anchors: [],
  build({ world }, p) {
    const b = dynamicBox(world, pos(p), v(LEN, THICK), 0, {
      density: DENSITY,
      friction: 0.5,
      restitution: 0.1,
      data: { part: p.id, tags: ['seesaw'] },
    })
    const j = pin(world, b, pos(p))
    j.setLimits(-LIMIT, LIMIT)
    j.enableLimit(true)
    return instance(p, [b])
  },
}
