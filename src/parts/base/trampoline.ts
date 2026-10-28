import { staticBox } from '../../engine/bodies'
import { v } from '../../engine/vec'
import { CELL, instance, pos } from '../common'
import type { PartDef } from '../types'
import { applyGlow, poseOf, rectPts, toWorld } from '../drawing'

/** Static, 3 × 1 cells. Planck mixes restitution with max(), so anything landing on it bounces at 0.95. */
export const trampoline: PartDef = {
  kind: 'trampoline',
  label: 'Trampoline',
  size: { w: 3, h: 1 },
  rotStep: 0,
  flippable: false,
  settings: [],
  anchors: [],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const w = 3 * CELL
    const pose = poseOf(s)
    pen.poly(toWorld(pose, rectPts(w, CELL)))
    const zig = [-w / 2, -w / 3, -w / 6, 0, w / 6, w / 3, w / 2].map((x, i) => v(x, i % 2 === 0 ? 4 : -4))
    pen.path(toWorld(pose, zig))
  },
  build({ world }, p) {
    const b = staticBox(world, pos(p), v(3 * CELL, CELL), 0, {
      friction: 0.5,
      restitution: 0.95,
      data: { part: p.id, tags: ['trampoline'] },
    })
    return instance(p, [b])
  },
}
