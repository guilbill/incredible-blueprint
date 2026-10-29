import { type Vec, add, len, pointSegmentDistance, sub, v } from '../engine/vec'

/** Gap (units) between a wheel's rim and the belt drawn around it. */
export const BELT_GAP = 4

/** Closed belt around two wheels: outer tangent points and the (gap-inclusive) circles. */
export interface BeltLoop { a1: Vec; b1: Vec; a2: Vec; b2: Vec; ca: Vec; ra: number; cb: Vec; rb: number }

const TAU = Math.PI * 2

/** Angle of `ang` past `from`, in [0, 2π). */
const past = (ang: number, from: number): number => ((ang - from) % TAU + TAU) % TAU

/** Direction of centre A to centre B, and half-angle between it and the tangent radii. */
function frame(loop: BeltLoop): { th: number; be: number } {
  const dx = loop.cb.x - loop.ca.x
  const dy = loop.cb.y - loop.ca.y
  return { th: Math.atan2(dy, dx), be: Math.acos((loop.ra - loop.rb) / Math.sqrt(dx * dx + dy * dy)) }
}

/** Open belt (both wheels turn the same way) on the outer tangents; null when one wheel swallows the other. */
export function beltLoop(ca: Vec, ra: number, cb: Vec, rb: number): BeltLoop | null {
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  const d = Math.sqrt(dx * dx + dy * dy)
  if (d <= Math.abs(ra - rb)) return null
  const th = Math.atan2(dy, dx)
  const be = Math.acos((ra - rb) / d)
  const at = (c: Vec, r: number, ang: number): Vec => add(c, v(r * Math.cos(ang), r * Math.sin(ang)))
  return { a1: at(ca, ra, th + be), b1: at(cb, rb, th + be), a2: at(ca, ra, th - be), b2: at(cb, rb, th - be), ca, ra, cb, rb }
}

/** Traces the loop: a2 to b2, around cb, b1 back to a1, around ca, closed. Does not stroke. */
export function traceBelt(ctx: CanvasRenderingContext2D, loop: BeltLoop): void {
  const { a1, a2, b2, ca, ra, cb, rb } = loop
  const { th, be } = frame(loop)
  ctx.beginPath()
  ctx.moveTo(a2.x, a2.y)
  ctx.lineTo(b2.x, b2.y)
  ctx.arc(cb.x, cb.y, rb, th - be, th + be, false)
  ctx.lineTo(a1.x, a1.y)
  ctx.arc(ca.x, ca.y, ra, th + be, th - be + TAU, false)
  ctx.closePath()
}

/** Distance from a point to an arc of circle (c, r) running from angle `from` over `span` radians. */
function arcDistance(pt: Vec, c: Vec, r: number, from: number, span: number): number {
  const dx = pt.x - c.x
  const dy = pt.y - c.y
  if (past(Math.atan2(dy, dx), from) <= span) return Math.abs(Math.sqrt(dx * dx + dy * dy) - r)
  const end = (ang: number): Vec => v(c.x + r * Math.cos(ang), c.y + r * Math.sin(ang))
  const e1 = end(from)
  const e2 = end(from + span)
  return Math.min(len(sub(pt, e1)), len(sub(pt, e2)))
}

/** Distance from a point to the belt line: its two straight runs and its two arcs. */
export function distanceToBelt(pt: Vec, loop: BeltLoop): number {
  const { a1, b1, a2, b2, ca, ra, cb, rb } = loop
  const { th, be } = frame(loop)
  return Math.min(
    pointSegmentDistance(pt, a2, b2),
    pointSegmentDistance(pt, a1, b1),
    arcDistance(pt, cb, rb, th - be, 2 * be),
    arcDistance(pt, ca, ra, th + be, TAU - 2 * be),
  )
}
