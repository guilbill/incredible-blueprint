import { type Vec, add, dot, rotate, sub, v } from '../engine/vec'
import { CELL, angleOf } from '../parts/common'
import { partDef } from '../parts/registry'
import type { Placement } from './types'

export const FIELD = { w: 64 * CELL, h: 40 * CELL }
export const SNAP = 10
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

/** Allowed rotation, inside the field, and no footprint overlap with any other placement (same id ignored). */
export function canPlace(p: Placement, others: Placement[]): boolean {
  if (!rotAllowed(p)) return false
  if (p.flip && !partDef(p.kind).flippable) return false
  const fp = footprint(p)
  for (const c of fp) {
    if (c.x < -EPS || c.y < -EPS || c.x > FIELD.w + EPS || c.y > FIELD.h + EPS) return false
  }
  for (const o of others) {
    if (o.id === p.id) continue
    if (overlaps(fp, footprint(o))) return false
  }
  return true
}
