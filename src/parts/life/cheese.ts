import { compound } from '../../engine/bodies'
import { type Vec, v } from '../../engine/vec'
import { CELL, DENSITY, instance, pos } from '../common'
import { applyGlow, arcPts, poseOf, toWorld } from '../drawing'
import type { AnchorDef, PartDef } from '../types'

/** Wedge block: 20 wide, 14 tall, sitting at the bottom of its cell. */
const WH = v(CELL, 14)
const OFFSET = v(0, 3)
const ANCHOR: AnchorDef = { key: 'rope', local: v(0, -4), role: 'rope' }

/** Drawing: a slice of a round cheese lying flat, apex at (-11, 10), radius 22, top edge rising 14. */
const APEX = v(-11, 10)
const R = 22
const TOP = -Math.asin(14 / R)

/** Half circle of radius r centred at p, from p - r·u to p + r·u, bulging along n (into the cheese). */
const bite = (p: Vec, u: Vec, n: Vec, r: number): Vec[] =>
  Array.from({ length: 9 }, (_, i) => {
    const a = (Math.PI * i) / 8
    return v(p.x - u.x * r * Math.cos(a) + n.x * r * Math.sin(a), p.y - u.y * r * Math.cos(a) + n.y * r * Math.sin(a))
  })

/** Outline: the top edge with a bite near its end, the rind arc, then the bottom with two bites back to the apex. */
const OUTLINE: Vec[] = (() => {
  const up = v(Math.cos(TOP), Math.sin(TOP))
  const slope = 0.91 * R
  return [
    APEX,
    ...bite(v(APEX.x + up.x * slope, APEX.y + up.y * slope), up, v(-up.y, up.x), 1.9),
    ...arcPts(APEX.x, APEX.y, R, R, TOP, 0, 12),
    ...bite(v(5.5, 10), v(-1, 0), v(0, -1), 2.2),
    ...bite(v(-6, 10), v(-1, 0), v(0, -1), 2),
  ]
})()
const HOLES: [number, number, number, number][] = [[6, 3.3, 1.3, 1.8], [2.3, 6.6, 1.5, 1.3]]

/** The string tied round the slice, drawn only while a rope holds it: straight down from the rope anchor, a bow where it meets the top edge. */
const KNOT = v(ANCHOR.local.x, APEX.y + (ANCHOR.local.x - APEX.x) * (Math.sin(TOP) / Math.cos(TOP)))
/** Bow loops: flattened ellipses (half-length 2.4, half-width 1.6) leaning out from the knot, up-left and right. */
const LOOPS: Vec[][] = [-2.6, -0.3].map((a) => {
  const d = v(Math.cos(a), Math.sin(a))
  const c = v(KNOT.x + d.x * 2.4, KNOT.y + d.y * 2.4)
  return Array.from({ length: 14 }, (_, i) => {
    const t = (2 * Math.PI * i) / 14
    return v(c.x + d.x * 2.4 * Math.cos(t) - d.y * 1.6 * Math.sin(t), c.y + d.y * 2.4 * Math.cos(t) + d.x * 1.6 * Math.sin(t))
  })
})

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
    const W = (pts: Vec[]) => toWorld(poseOf(s), pts)
    pen.poly(W(OUTLINE))
    for (const [x, y, rx, ry] of HOLES) pen.poly(W(arcPts(x, y, rx, ry, 0, 2 * Math.PI, 14).slice(0, -1)))
    if (!s.roped) return
    pen.path(W([ANCHOR.local, v(KNOT.x, APEX.y)]))
    for (const loop of LOOPS) pen.poly(W(loop))
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
