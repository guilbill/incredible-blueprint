import { compound } from '../../engine/bodies'
import { v } from '../../engine/vec'
import { CELL, DENSITY, instance, pos } from '../common'
import { applyGlow, poseOf, toWorld } from '../drawing'
import type { AnchorDef, PartDef } from '../types'

/** Wedge block: 20 wide, 14 tall, sitting at the bottom of its cell. */
const WH = v(CELL, 14)
const OFFSET = v(0, 3)
const ANCHOR: AnchorDef = { key: 'rope', local: v(0, -4), role: 'rope' }

/** Light dynamic cheese (1 × 1) with a rope anchor on top. A mouse touching it eats it (`state.eaten`). */
export const cheese: PartDef = {
  kind: 'cheese',
  label: 'Fromage',
  size: { w: 1, h: 1 },
  rotStep: 0,
  flippable: false,
  settings: [],
  anchors: [ANCHOR],
  draw(pen, s) {
    if (s.inst?.state.eaten) return
    pen.reset()
    applyGlow(pen, s)
    const W = (pts: { x: number; y: number }[]) => toWorld(poseOf(s), pts)
    pen.poly(W([v(-10, 10), v(10, 10), v(10, -4), v(-10, 3)]))
    for (const [x, y] of [[-4, 5], [4, 2], [5, 7]]) {
      const [c] = W([v(x, y)])
      pen.circle(c, 1.5)
    }
  },
  build({ world }, p) {
    const b = compound(world, pos(p), [{ kind: 'box', wh: WH, offset: OFFSET }], {
      density: 0.5 * DENSITY,
      friction: 0.5,
      data: { part: p.id, tags: ['cheese'] },
    })
    const inst = instance(p, [b], { rope: { body: b, local: ANCHOR.local, radius: 0 } })
    inst.state.eaten = 0
    return inst
  },
}
