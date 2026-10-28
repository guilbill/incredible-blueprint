import type { Body } from 'planck'
import { type Outline, data, outlines, setVelocityX, touching } from '../../engine/bodies'
import { type Vec, add, pointSegmentDistance, segmentsIntersect, v } from '../../engine/vec'
import { bodyPose } from '../../engine/world'
import type { PartInstance, SimCtx } from '../types'

/** Tags of the characters: they never hide anything from each other's sight. */
const CHARACTERS = ['cat', 'mouse']
/** What a walker pushes or touches instead of stopping in front of it (food, prey, the trap's plate). */
const NOT_WALLS = ['cat', 'mouse', 'cheese', 'fish', 'mousetrap']
/** Probe length (units) ahead of the walker's front face. */
const PROBE = 4

/** All the sight and probe tests need: the world's bodies. */
type Sight = Pick<SimCtx, 'world'>

const hasTag = (b: Body, tags: string[]): boolean => data(b).tags.some((t) => tags.includes(t))

export const centre = (b: Body): Vec => {
  const p = bodyPose(b)
  return v(p.x, p.y)
}

export const sqDist = (a: Vec, b: Vec): number => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)

/** Has a solid contact whose normal points up toward the walker (it stands on something). */
export const grounded = (self: Body): boolean => touching(self).some((t) => t.normal.y < -0.5)

/** While grounded, sets the horizontal velocity to dir × speed (units/s); in the air it does nothing. */
export function walk(self: Body, dir: -1 | 0 | 1, speed: number): void {
  if (grounded(self)) setVelocityX(self, dir * speed)
}

function hits(o: Outline, a: Vec, b: Vec): boolean {
  if (o.kind === 'circle') return pointSegmentDistance(o.c, a, b) <= o.r
  const n = o.pts.length
  for (let i = 0; i < n; i++) if (segmentsIntersect(a, b, o.pts[i], o.pts[(i + 1) % n])) return true
  return inside(o.pts, a)
}

/** Point inside a convex polygon (either winding). */
function inside(pts: Vec[], p: Vec): boolean {
  let sign = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (c === 0) continue
    if (sign === 0) sign = c > 0 ? 1 : -1
    else if ((c > 0 ? 1 : -1) !== sign) return false
  }
  return true
}

/** First body (creation order) other than `skip` whose solid outline the segment a-b touches. */
function firstHit(sim: Sight, a: Vec, b: Vec, skip: (body: Body) => boolean): Body | null {
  for (const body of sim.world.bodies()) {
    if (!body.isActive() || skip(body)) continue
    if (outlines(body).some((o) => hits(o, a, b))) return body
  }
  return null
}

/**
 * Two horizontal probes, at a quarter of the walker's height above and below its centre, from its
 * front face to 4 units ahead. True when one touches a solid body that is not a character, food or
 * a mousetrap (those get pushed or touched instead).
 */
export function blocked(self: Body, dir: -1 | 1, sim: Sight): boolean {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const o of outlines(self)) {
    const pts = o.kind === 'poly' ? o.pts : [add(o.c, v(-o.r, -o.r)), add(o.c, v(o.r, o.r))]
    for (const p of pts) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
  }
  const front = dir > 0 ? maxX : minX
  const quarter = (maxY - minY) / 4
  const mid = (minY + maxY) / 2
  const skip = (b: Body) => b === self || hasTag(b, NOT_WALLS)
  return [mid - quarter, mid + quarter].some(
    (y) => firstHit(sim, v(front, y), v(front + dir * PROBE, y), skip) !== null,
  )
}

/**
 * Nothing solid between from and to: static and dynamic bodies count, characters and the bodies in
 * `ignore` (usually the target itself) do not. Bodies are tested in creation order.
 */
export function lineOfSight(from: Vec, to: Vec, sim: Sight, ignore: Body[] = []): boolean {
  return firstHit(sim, from, to, (b) => ignore.includes(b) || hasTag(b, CHARACTERS)) === null
}

/** Nearest body (squared distance, creation order on ties) among `cands` within `range` and in sight. */
export function nearestSeen(self: Body, cands: Body[], sim: Sight, range = Infinity): Body | null {
  const me = centre(self)
  let best: Body | null = null
  let bestD = range * range
  for (const c of cands) {
    if (!c.isActive()) continue
    const d = sqDist(me, centre(c))
    if (d > bestD || (best && d === bestD)) continue
    if (!lineOfSight(me, centre(c), sim, [c])) continue
    best = c
    bestD = d
  }
  return best
}

/** Main bodies of the parts of a kind, in placement order. */
export const bodiesOf = (sim: SimCtx, kind: PartInstance['kind'], keep: (p: PartInstance) => boolean = () => true): Body[] =>
  sim.parts.filter((p) => p.kind === kind && keep(p)).map((p) => p.bodies[0])
