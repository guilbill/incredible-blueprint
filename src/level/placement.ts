import { type Vec, add, dot, rotate, sub, v } from '../engine/vec'
import { CELL, angleOf } from '../parts/common'
import { MESH_TOL, gearRadius } from '../parts/mech/gear'
import { partDef } from '../parts/registry'
import type { AnchorDef } from '../parts/types'
import type { Placement } from './types'

export const FIELD = { w: 64 * CELL, h: 40 * CELL }
export const SNAP = 10
/** How far (units) a gear being placed is pulled onto a mesh position. */
export const MAGNET = 16
const EPS = 1e-6

/** Rounds to the nearest multiple of 10 units. */
export const snap = (x: number): number => Math.round(x / SNAP) * SNAP + 0

/** Size in cells of a placed part, taking settings such as `length` into account. */
export function sizeOf(p: Placement): { w: number; h: number } {
  const def = partDef(p.kind)
  return def.sizeOf ? def.sizeOf(p) : def.size
}

/** World polygon (4 corners, in units) of the part's bounding box after flip then rotation. */
export function footprint(p: Placement): Vec[] {
  const { w, h } = sizeOf(p)
  const hw = (w * CELL) / 2
  const hh = (h * CELL) / 2
  const a = angleOf(p)
  const corners = [v(-hw, -hh), v(hw, -hh), v(hw, hh), v(-hw, hh)]
  return corners.map((c) => add(v(p.x, p.y), rotate(v(p.flip ? -c.x : c.x, c.y), a)))
}

/** World position (units) of an anchor of a placed part, before simulation (flip then rotation). */
export function anchorPoint(p: Placement, a: AnchorDef): Vec {
  return add(v(p.x, p.y), rotate(v(p.flip ? -a.local.x : a.local.x, a.local.y), angleOf(p)))
}

function axes(poly: Vec[]): Vec[] {
  return poly.map((p, i) => {
    const e = sub(poly[(i + 1) % poly.length], p)
    return v(-e.y, e.x)
  })
}

function project(poly: Vec[], axis: Vec): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const p of poly) {
    const d = dot(p, axis)
    if (d < lo) lo = d
    if (d > hi) hi = d
  }
  return [lo, hi]
}

/** SAT on convex polygons; shapes that only touch do not overlap. */
export function overlaps(a: Vec[], b: Vec[]): boolean {
  for (const axis of [...axes(a), ...axes(b)]) {
    const l = Math.sqrt(dot(axis, axis))
    if (l === 0) continue
    const [aLo, aHi] = project(a, axis)
    const [bLo, bHi] = project(b, axis)
    if (aHi - bLo <= EPS * l || bHi - aLo <= EPS * l) return false
  }
  return true
}

export function rotAllowed(p: Placement): boolean {
  if (!Number.isInteger(p.rot) || p.rot < 0 || p.rot > 23) return false
  const step = partDef(p.kind).rotStep
  return step === 0 ? p.rot === 0 : p.rot % step === 0
}

/** True when a disc overlaps a convex polygon: centre inside it, or closer than r to an edge. */
function discOverlaps(c: Vec, r: number, poly: Vec[]): boolean {
  let pos = 0
  let neg = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const e = sub(b, a)
    const len2 = dot(e, e)
    const w = sub(c, a)
    if (e.x * w.y - e.y * w.x < 0) neg++
    else pos++
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, dot(w, e) / len2))
    const d = sub(w, v(e.x * t, e.y * t))
    if (Math.sqrt(dot(d, d)) < r - EPS) return true
  }
  return pos === 0 || neg === 0 // same side of every edge, whichever way the polygon winds
}

/** Whether two placements collide: gears are discs (meshing teeth may bite MESH_TOL), other parts use their footprint. */
function collide(p: Placement, fp: Vec[], o: Placement): boolean {
  const rp = gearRadius(p.kind)
  const ro = gearRadius(o.kind)
  if (rp !== undefined && ro !== undefined) {
    const dx = o.x - p.x
    const dy = o.y - p.y
    return Math.sqrt(dx * dx + dy * dy) < rp + ro - MESH_TOL
  }
  if (rp !== undefined) return discOverlaps(v(p.x, p.y), rp, footprint(o))
  if (ro !== undefined) return discOverlaps(v(o.x, o.y), ro, fp)
  return overlaps(fp, footprint(o))
}

/** Whether two placements overlap (see `canPlace`). */
export const collides = (p: Placement, o: Placement): boolean => collide(p, footprint(p), o)

/** Allowed rotation, inside the field, and no overlap with any other placement (same id ignored). */
export function canPlace(p: Placement, others: Placement[]): boolean {
  if (!rotAllowed(p)) return false
  if (p.flip && !partDef(p.kind).flippable) return false
  const fp = footprint(p)
  for (const c of fp) {
    if (c.x < -EPS || c.y < -EPS || c.x > FIELD.w + EPS || c.y > FIELD.h + EPS) return false
  }
  for (const o of others) {
    if (o.id === p.id) continue
    if (collide(p, fp, o)) return false
  }
  return true
}

/**
 * Pulls a gear being placed onto the mesh circle of a nearby gear: the closest valid position within MAGNET
 * of the cursor, rounded to 0.01 unit, or undefined when none.
 */
export function gearMagnet(p: Placement, at: Vec, others: Placement[]): Placement | undefined {
  const r = gearRadius(p.kind)
  if (r === undefined) return undefined
  let best: Placement | undefined
  let bestD = Infinity
  for (const o of others) {
    const ro = gearRadius(o.kind)
    if (ro === undefined || o.id === p.id) continue
    const dx = at.x - o.x
    const dy = at.y - o.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len === 0) continue
    const k = (r + ro) / len
    const x = Math.round((o.x + dx * k) * 100) / 100
    const y = Math.round((o.y + dy * k) * 100) / 100
    const d = Math.sqrt((x - at.x) * (x - at.x) + (y - at.y) * (y - at.y))
    if (d > MAGNET || d >= bestD) continue
    const cand = { ...p, x, y }
    if (!canPlace(cand, others)) continue
    best = cand
    bestD = d
  }
  return best
}
