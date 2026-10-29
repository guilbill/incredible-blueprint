import { v, type Vec } from '../engine/vec'
import { LIMITS } from '../level/codec'
import { FIELD, canPlace, footprint, overlaps, snap } from '../level/placement'
import type { Level, Link, PartKind, Placement, Solution } from '../level/types'
import { canLink } from '../parts/mech/links'
import { nextId, nextLinkId, remaining } from './edit'

/** Pure group operations on a player's solution (multi-selection, copy and paste). Each returns null when refused. */

export type Rect = { x: number; y: number; w: number; h: number }

/** Copied parts and the links between them, positions as copied. */
export interface Clip { placements: Placement[]; links: Link[] }

export type Guide = { a: Vec; b: Vec }

const all = (level: Level, sol: Solution): Placement[] => [...level.fixed, ...sol.placements]

/** Bounding box of the footprints. */
export function groupBox(ps: Placement[]): Rect {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of ps) {
    for (const c of footprint(p)) {
      x0 = Math.min(x0, c.x)
      y0 = Math.min(y0, c.y)
      x1 = Math.max(x1, c.x)
      y1 = Math.max(y1, c.y)
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

const rectPoly = (r: Rect): Vec[] => [v(r.x, r.y), v(r.x + r.w, r.y), v(r.x + r.w, r.y + r.h), v(r.x, r.y + r.h)]

/** Player placements whose footprint touches the rectangle, minus the skipped ids. */
export function selectInRect(level: Level, sol: Solution, r: Rect, skip: ReadonlySet<string>): string[] {
  void level
  const poly = rectPoly(r)
  return sol.placements.filter((p) => !skip.has(p.id) && overlaps(footprint(p), poly)).map((p) => p.id)
}

/**
 * Moves the listed player placements by the same snapped offset. All or nothing: null when an id is
 * unknown or any moved part would overlap another part or leave the field. Links that no longer hold are dropped.
 */
export function moveGroup(level: Level, sol: Solution, ids: readonly string[], dx: number, dy: number): Solution | null {
  const set = new Set(ids)
  if (set.size === 0 || ![...set].every((id) => sol.placements.some((p) => p.id === id))) return null
  const sx = snap(dx)
  const sy = snap(dy)
  const placements = sol.placements.map((p) => (set.has(p.id) ? { ...p, x: p.x + sx, y: p.y + sy } : p))
  const parts = [...level.fixed, ...placements]
  // canPlace ignores a part's own id, so each moved part is checked against the others in their new places
  if (!placements.every((p) => !set.has(p.id) || canPlace(p, parts))) return null
  return { placements, links: sol.links.filter((l) => canLink(l.a, l.b, parts)) }
}

/** Removes the listed player placements and any link attached to them. */
export function removeGroup(sol: Solution, ids: readonly string[]): Solution {
  const set = new Set(ids)
  return {
    placements: sol.placements.filter((p) => !set.has(p.id)),
    links: sol.links.filter((l) => !set.has(l.a.part) && !set.has(l.b.part)),
  }
}

/** Copies the listed player placements and the links whose two ends are both among them. */
export function copyGroup(sol: Solution, ids: readonly string[]): Clip {
  const set = new Set(ids)
  return {
    placements: sol.placements.filter((p) => set.has(p.id)).map((p) => ({ ...p, settings: { ...p.settings } })),
    links: sol.links.filter((l) => set.has(l.a.part) && set.has(l.b.part)).map((l) => ({ ...l, a: { ...l.a }, b: { ...l.b } })),
  }
}

/** Gap (units) between a pasted copy and the original when pasting to the right. */
const PASTE_GAP = 20

/** Offsets (box-centre moves from the first spot) of the square ring of radius r on the 10-unit grid. */
function* ring(r: number): Generator<Vec> {
  for (let x = -r; x <= r; x += 10) yield v(x, -r)
  for (let y = -r + 10; y <= r; y += 10) yield v(r, y)
  for (let x = r - 10; x >= -r; x -= 10) yield v(x, r)
  for (let y = r - 10; y > -r; y -= 10) yield v(-r, y)
}

/**
 * Pastes a clip with its box centre on the snapped `centre` (`prefer: 'at'`) or just right of it
 * (`'right'`, for duplicating in place). When that spot is taken, the nearest free spot is used.
 * Null when the inventory, the part or link limits, or the field leave no room. Pasted parts get
 * new ids and their links are re-pointed to them; `ids` are the new placements.
 */
export function pasteClip(level: Level, sol: Solution, clip: Clip, centre: Vec, prefer: 'at' | 'right'): { sol: Solution; ids: string[] } | null {
  if (clip.placements.length === 0) return null
  const left = remaining(level, sol)
  const need = new Map<PartKind, number>()
  for (const p of clip.placements) need.set(p.kind, (need.get(p.kind) ?? 0) + 1)
  for (const [kind, n] of need) if ((left.get(kind) ?? 0) < n) return null
  if (all(level, sol).length + clip.placements.length > LIMITS.fixed) return null
  if (level.fixedLinks.length + sol.links.length + clip.links.length > LIMITS.fixedLinks) return null

  // new ids first: canPlace ignores a part's own id, so copies must not share the originals'
  const idMap = new Map<string, string>()
  let placements = sol.placements
  for (const p of clip.placements) {
    const id = nextId(level, { ...sol, placements })
    idMap.set(p.id, id)
    placements = [...placements, { ...p, id }]
  }
  const copies = clip.placements.map((p) => ({ ...p, id: idMap.get(p.id)!, settings: { ...p.settings } }))

  const box = groupBox(clip.placements)
  const mid = v(box.x + box.w / 2, box.y + box.h / 2)
  const first = prefer === 'right' ? v(centre.x + box.w + PASTE_GAP, centre.y) : centre
  const spots: Vec[] = [v(snap(first.x), snap(first.y))]
  if (prefer === 'right') {
    spots.push(v(snap(centre.x), snap(centre.y + box.h + PASTE_GAP)))
    spots.push(v(snap(centre.x - box.w - PASTE_GAP), snap(centre.y)))
    spots.push(v(snap(centre.x), snap(centre.y - box.h - PASTE_GAP)))
  }
  const origin = spots[0]
  // boxes of the existing parts, so each candidate is only tested against its neighbours
  const existing = all(level, sol).map((p) => ({ p, b: groupBox([p]) }))
  const fits = (spot: Vec): boolean => {
    const dx = spot.x - mid.x
    const dy = spot.y - mid.y
    // cheap field check before the overlap tests
    if (box.x + dx < 0 || box.y + dy < 0 || box.x + box.w + dx > FIELD.w || box.y + box.h + dy > FIELD.h) return false
    const moved = copies.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }))
    const near = existing.filter(({ b }) => b.x < box.x + box.w + dx && b.x + b.w > box.x + dx && b.y < box.y + box.h + dy && b.y + b.h > box.y + dy).map(({ p }) => p)
    const parts = [...near, ...moved]
    return moved.every((p) => canPlace(p, parts))
  }
  let spot = spots.find(fits)
  for (let r = 10; !spot && r <= Math.max(FIELD.w, FIELD.h); r += 10) {
    for (const o of ring(r)) {
      const s = v(origin.x + o.x, origin.y + o.y)
      if (fits(s)) {
        spot = s
        break
      }
    }
  }
  if (!spot) return null

  const dx = spot.x - mid.x
  const dy = spot.y - mid.y
  placements = [...sol.placements, ...copies.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }))]
  let links = sol.links
  for (const l of clip.links) {
    const id = nextLinkId(level, { ...sol, links })
    links = [...links, { ...l, id, a: { ...l.a, part: idMap.get(l.a.part)! }, b: { ...l.b, part: idMap.get(l.b.part)! } }]
  }
  return { sol: { placements, links }, ids: [...idMap.values()] }
}

const GUIDE_TOL = 0.5

/**
 * Dotted guides for a dragged group: where an edge or centre of its box lines up
 * with an edge or centre of another part, one guide spanning both. Vertical lines come first, then horizontal.
 */
export function guidesFor(moved: Placement[], others: Placement[]): Guide[] {
  if (moved.length === 0) return []
  const m = groupBox(moved)
  const xs = (r: Rect): number[] => [r.x, r.x + r.w / 2, r.x + r.w]
  const ys = (r: Rect): number[] => [r.y, r.y + r.h / 2, r.y + r.h]
  const out: Guide[] = []
  const seen = new Set<string>()
  const add = (g: Guide): void => {
    const key = `${g.a.x},${g.a.y},${g.b.x},${g.b.y}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push(g)
    }
  }
  const vertical: Guide[] = []
  const horizontal: Guide[] = []
  for (const o of others) {
    const b = groupBox([o])
    for (const mx of xs(m)) {
      for (const ox of xs(b)) {
        if (Math.abs(mx - ox) <= GUIDE_TOL) vertical.push({ a: v(mx, Math.min(m.y, b.y)), b: v(mx, Math.max(m.y + m.h, b.y + b.h)) })
      }
    }
    for (const my of ys(m)) {
      for (const oy of ys(b)) {
        if (Math.abs(my - oy) <= GUIDE_TOL) horizontal.push({ a: v(Math.min(m.x, b.x), my), b: v(Math.max(m.x + m.w, b.x + b.w), my) })
      }
    }
  }
  for (const g of [...vertical, ...horizontal]) add(g)
  return out
}
