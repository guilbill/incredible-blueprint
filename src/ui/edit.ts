import { add, dot, len, pointSegmentDistance, rotate, sub, v, type Vec } from '../engine/vec'
import { LIMITS } from '../level/codec'
import { anchorPoint, canPlace, footprint, sizeOf, snap } from '../level/placement'
import type { Anchor, Level, Link, PartKind, Placement, Solution } from '../level/types'
import { BELT_GAP, beltLoop, distanceToBelt } from '../render/belt'
import { anchorDef, canLink } from '../parts/mech/links'
import { CELL, angleOf } from '../parts/common'
import { partDef } from '../parts/registry'

/** Pure edit operations on a player's solution. Each returns a new Solution, or null when refused. */

/** Remaining count per inventory kind once the solution's placements are taken out. */
export function remaining(level: Level, sol: Solution): Map<PartKind, number> {
  const left = new Map<PartKind, number>()
  for (const it of level.inventory) left.set(it.kind, (left.get(it.kind) ?? 0) + it.count)
  for (const p of sol.placements) left.set(p.kind, (left.get(p.kind) ?? 0) - 1)
  return left
}

/** First free id `p1`, `p2`… not used by a fixed part or the solution. */
export function nextId(level: Level, sol: Solution): string {
  const used = new Set([...level.fixed, ...sol.placements].map((p) => p.id))
  let n = 1
  while (used.has(`p${n}`)) n++
  return `p${n}`
}

const all = (level: Level, sol: Solution): Placement[] => [...level.fixed, ...sol.placements]

/** A new placement of `kind` centred on the snapped point, with default rotation and settings. */
export function draftPlacement(kind: PartKind, at: Vec, id: string): Placement {
  return { id, kind, x: snap(at.x), y: snap(at.y), rot: 0, flip: false, settings: {} }
}

const PORTAL_CHANNELS = 3

/**
 * Settings a part gets when it comes out of the drawer. Portals come in pairs: a portal with no
 * channel joins the first channel (1..3) holding fewer than two portals, fixed ones included, so
 * two portals placed one after the other share a channel. Explicit settings are kept.
 */
export function drawerDefaults(level: Level, sol: Solution, p: Placement): Placement {
  if (p.kind !== 'portal' || p.settings.channel !== undefined) return p
  const used = new Map<number, number>()
  for (const q of all(level, sol)) {
    if (q.kind !== 'portal' || q.id === p.id) continue
    const ch = q.settings.channel ?? 1
    used.set(ch, (used.get(ch) ?? 0) + 1)
  }
  let channel = 1
  while (channel < PORTAL_CHANNELS && (used.get(channel) ?? 0) >= 2) channel++
  return { ...p, settings: { ...p.settings, channel } }
}

/** Adds a part from the drawer (see drawerDefaults); null when none is left, the id is taken, it doesn't fit or the level is full. */
export function addPart(level: Level, sol: Solution, part: Placement): Solution | null {
  const p = drawerDefaults(level, sol, part)
  if ((remaining(level, sol).get(p.kind) ?? 0) <= 0) return null
  if (all(level, sol).some((q) => q.id === p.id)) return null
  if (all(level, sol).length >= LIMITS.fixed) return null
  if (!canPlace(p, all(level, sol))) return null
  return { ...sol, placements: [...sol.placements, p] }
}

/**
 * Replaces the player placement with the same id, if the new one can be placed. Links it no longer
 * allows (a belt between two gears that now mesh) are dropped.
 */
export function updatePart(level: Level, sol: Solution, p: Placement): Solution | null {
  if (!sol.placements.some((q) => q.id === p.id)) return null
  if (!canPlace(p, all(level, sol))) return null
  const placements = sol.placements.map((q) => (q.id === p.id ? p : q))
  const parts = [...level.fixed, ...placements]
  return { placements, links: sol.links.filter((l) => canLink(l.a, l.b, parts)) }
}

/** Removes a player placement and any link attached to it. */
export function removePart(sol: Solution, id: string): Solution {
  return {
    placements: sol.placements.filter((p) => p.id !== id),
    links: sol.links.filter((l) => l.a.part !== id && l.b.part !== id),
  }
}

/** Rotates by the part's rotStep (dir 1 = clockwise); null if the part cannot rotate. */
export function rotated(p: Placement, dir: 1 | -1): Placement | null {
  const step = partDef(p.kind).rotStep
  if (step === 0) return null
  return { ...p, rot: (((p.rot + dir * step) % 24) + 24) % 24 }
}

export function flipped(p: Placement): Placement | null {
  return partDef(p.kind).flippable ? { ...p, flip: !p.flip } : null
}

/** Sets a setting, stepping and clamping to its range; null if the key is unknown or nothing changes. */
export function withSetting(p: Placement, key: string, value: number): Placement | null {
  const s = partDef(p.kind).settings.find((d) => d.key === key)
  if (!s) return null
  const val = Math.min(s.max, Math.max(s.min, s.min + Math.round((value - s.min) / s.step) * s.step))
  if ((p.settings[key] ?? s.def) === val) return null
  return { ...p, settings: { ...p.settings, [key]: val } }
}

/** Distance (units) from the part's edge to its rotate handle, and past each end to its length handle. */
export const ROT_GAP = 22
export const END_GAP = 8
/** Click tolerance (units) around a handle. */
export const HANDLE_HIT = 9

export type HandleKind = 'rot' | 'start' | 'end'

/** Local frame of a part: its long axis (the one `length` sets, if any), half-length and half-thickness. */
function frameOf(p: Placement): { axis: Vec; half: number; thick: number } {
  const { w, h } = sizeOf(p)
  return w >= h ? { axis: v(1, 0), half: (w * CELL) / 2, thick: (h * CELL) / 2 } : { axis: v(0, 1), half: (h * CELL) / 2, thick: (w * CELL) / 2 }
}

const toWorldPt = (p: Placement, local: Vec): Vec => add(v(p.x, p.y), rotate(local, angleOf(p)))
const hasLength = (p: Placement): boolean => partDef(p.kind).settings.some((s) => s.key === 'length')

/** Local direction (from the centre) of the rotate handle: above the part, beside it for upright ones. */
function rotDir(p: Placement): Vec {
  const { axis } = frameOf(p)
  return axis.x === 1 ? v(0, -1) : v(1, 0)
}

/**
 * Handle positions in units: `rot` beside the long side when the part rotates, `start`/`end` past
 * both ends of the long axis when the part has a length.
 */
export function handlesOf(p: Placement): Partial<Record<HandleKind, Vec>> {
  const { axis, half, thick } = frameOf(p)
  const out: Partial<Record<HandleKind, Vec>> = {}
  if (partDef(p.kind).rotStep) {
    const d = rotDir(p)
    out.rot = toWorldPt(p, v(d.x * (thick + ROT_GAP), d.y * (thick + ROT_GAP)))
  }
  if (hasLength(p)) {
    const r = half + END_GAP
    out.start = toWorldPt(p, v(-axis.x * r, -axis.y * r))
    out.end = toWorldPt(p, v(axis.x * r, axis.y * r))
  }
  return out
}

/**
 * Handle of the part under the point, if any. A wider `tol` (a finger) only reaches past HANDLE_HIT
 * outside the part itself, so a press on the part still moves it.
 */
export function hitHandle(p: Placement, pt: Vec, tol = HANDLE_HIT): HandleKind | undefined {
  const hs = handlesOf(p)
  const onPart = tol > HANDLE_HIT && inConvex(pt, footprint(p))
  for (const k of ['rot', 'start', 'end'] as const) {
    const at = hs[k]
    const d = at && len(sub(at, pt))
    if (d !== undefined && (d <= HANDLE_HIT || (d <= tol && !onPart))) return k
  }
  return undefined
}

/** The part turned so its rotate handle points at `pt`, snapped to its rotation step; null if it cannot rotate or nothing changes. */
export function rotateToward(p: Placement, pt: Vec): Placement | null {
  const step = partDef(p.kind).rotStep
  if (!step) return null
  const d = rotDir(p)
  const a = Math.atan2(pt.y - p.y, pt.x - p.x) - Math.atan2(d.y, d.x)
  const notches = Math.round(a / ((step * Math.PI) / 12))
  const rot = ((((notches * step) % 24) + 24) % 24)
  return rot === p.rot ? null : { ...p, rot }
}

/** Free angle (radians, same convention as `angleOf`) the rotate handle would give at `pt`, before snapping. */
export function freeAngle(p: Placement, pt: Vec): number {
  const d = rotDir(p)
  return Math.atan2(pt.y - p.y, pt.x - p.x) - Math.atan2(d.y, d.x)
}

/** Sets the length to `cells` (clamped) keeping the other end in place; null if unchanged. */
export function resizeFrom(p: Placement, side: 'start' | 'end', cells: number): Placement | null {
  const s = partDef(p.kind).settings.find((d) => d.key === 'length')
  if (!s) return null
  const n = Math.min(s.max, Math.max(s.min, Math.round(cells)))
  const { axis, half } = frameOf(p)
  const sign = side === 'end' ? 1 : -1
  // the other end stays at -sign·half along the axis; the centre moves to the middle of the new span
  const shift = sign * ((n * CELL) / 2 - half)
  if (shift === 0) return null
  const c = add(v(p.x, p.y), rotate(v(axis.x * shift, axis.y * shift), angleOf(p)))
  const r2 = (x: number) => Math.round(x * 100) / 100
  return { ...p, x: r2(c.x), y: r2(c.y), settings: { ...p.settings, length: n } }
}

/** One cell longer (`by` = 1) or shorter on the `side` end; null at the limit. */
export function grow(p: Placement, side: 'start' | 'end', by: number): Placement | null {
  const s = partDef(p.kind).settings.find((d) => d.key === 'length')
  return s ? resizeFrom(p, side, (p.settings.length ?? s.def) + by) : null
}

/** Direction (radians) of the rotate handle relative to the part's own angle. */
export function rotHandleOffset(p: Placement): number {
  const d = rotDir(p)
  return Math.atan2(d.y, d.x)
}

/** Length from dragging the `side` handle to `pt`: the span from the fixed end to the pointer, in whole cells. */
export function resizeToward(p: Placement, side: 'start' | 'end', pt: Vec): Placement | null {
  const { axis, half } = frameOf(p)
  const sign = side === 'end' ? 1 : -1
  const local = rotate(sub(pt, v(p.x, p.y)), -angleOf(p))
  const along = dot(local, axis)
  const span = sign * along - END_GAP + half
  return resizeFrom(p, side, span / CELL)
}

function inConvex(pt: Vec, poly: Vec[]): boolean {
  let sign = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const e = sub(poly[(i + 1) % poly.length], a)
    const c = dot({ x: -e.y, y: e.x }, sub(pt, a))
    if (c === 0) continue
    const s = c > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

/** Topmost (last drawn) player placement whose footprint contains the point. */
export function hitPart(sol: Solution, pt: Vec): Placement | undefined {
  for (let i = sol.placements.length - 1; i >= 0; i--) {
    if (inConvex(pt, footprint(sol.placements[i]))) return sol.placements[i]
  }
  return undefined
}

/** Click tolerance (units) along a link. */
export const LINK_HIT = 5

const sameAnchor = (a: Anchor, b: Anchor): boolean => a.part === b.part && a.anchor === b.anchor

/** First free link id `l1`, `l2`… among the level's fixed links and the solution's links. */
export function nextLinkId(level: Level, sol: Solution): string {
  const used = new Set([...level.fixedLinks, ...sol.links].map((l) => l.id))
  let n = 1
  while (used.has(`l${n}`)) n++
  return `l${n}`
}

/** Adds a rope or a belt (from the anchors' role) between two anchors; null if they can't be linked, already are, or the level is full. */
export function addLink(level: Level, sol: Solution, a: Anchor, b: Anchor): Solution | null {
  const parts = all(level, sol)
  if (!canLink(a, b, parts)) return null
  if (level.fixedLinks.length + sol.links.length >= LIMITS.fixedLinks) return null
  const dup = (l: Link) => (sameAnchor(l.a, a) && sameAnchor(l.b, b)) || (sameAnchor(l.a, b) && sameAnchor(l.b, a))
  if ([...level.fixedLinks, ...sol.links].some(dup)) return null
  const kind = anchorDef(a, parts)!.role
  return { ...sol, links: [...sol.links, { id: nextLinkId(level, sol), kind, a: { ...a }, b: { ...b } }] }
}

export function removeLink(sol: Solution, id: string): Solution {
  return { ...sol, links: sol.links.filter((l) => l.id !== id) }
}

/** World point of an anchor before simulation, if the part and anchor exist. */
export function anchorAt(level: Level, sol: Solution, a: Anchor): Vec | undefined {
  const p = all(level, sol).find((q) => q.id === a.part)
  const d = p && partDef(p.kind).anchors.find((q) => q.key === a.anchor)
  return p && d ? anchorPoint(p, d) : undefined
}

export type LinkTool = 'rope' | 'belt'

/** Topmost part under the point: player placements first, then fixed parts. */
export function hitAnyPart(level: Level, sol: Solution, pt: Vec): Placement | undefined {
  return hitPart(sol, pt) ?? [...level.fixed].reverse().find((p) => inConvex(pt, footprint(p)))
}

/** Every anchor of the tool's role; once a first anchor is chosen, only those it can be linked to. */
export function linkTargets(level: Level, sol: Solution, tool: LinkTool, first?: Anchor): Anchor[] {
  const out: Anchor[] = []
  for (const p of all(level, sol)) {
    for (const d of partDef(p.kind).anchors) {
      if (d.role !== tool) continue
      const a = { part: p.id, anchor: d.key }
      if (!first || addLink(level, sol, first, a) !== null) out.push(a)
    }
  }
  return out
}

/** The target on `part` closest to the point. */
export function pickAnchor(targets: Anchor[], part: Placement, level: Level, sol: Solution, pt: Vec): Anchor | undefined {
  let best: Anchor | undefined
  let bestDist = Infinity
  for (const a of targets) {
    if (a.part !== part.id) continue
    const at = anchorAt(level, sol, a)
    if (!at) continue
    const d = len(sub(at, pt))
    if (d < bestDist) {
      best = a
      bestDist = d
    }
  }
  return best
}

/** Id of the player link passing under the point (last added first). */
export function hitLink(level: Level, sol: Solution, pt: Vec): string | undefined {
  const parts = all(level, sol)
  for (let i = sol.links.length - 1; i >= 0; i--) {
    const l = sol.links[i]
    const a = anchorAt(level, sol, l.a)
    const b = anchorAt(level, sol, l.b)
    if (!a || !b) continue
    if (l.kind === 'belt') {
      const ra = anchorDef(l.a, parts)?.radius
      const rb = anchorDef(l.b, parts)?.radius
      const loop = ra !== undefined && rb !== undefined ? beltLoop(a, ra + BELT_GAP, b, rb + BELT_GAP) : null
      if (loop) {
        if (distanceToBelt(pt, loop) <= LINK_HIT) return l.id
        continue
      }
    }
    if (pointSegmentDistance(pt, a, b) <= LINK_HIT) return l.id
  }
  return undefined
}

const isAnchor = (x: unknown): x is Anchor => {
  const a = x as Partial<Anchor> | null
  return !!a && typeof a === 'object' && typeof a.part === 'string' && typeof a.anchor === 'string'
}

/**
 * Keeps only the draft placements that still fit the level (kind in the inventory, within counts,
 * placeable, unique id). Used when restoring a saved draft, which may come from an older level.
 */
export function sanitizeDraft(level: Level, draft: unknown): Solution {
  let sol: Solution = { placements: [], links: [] }
  const d = draft as Partial<Solution> | null
  if (!d || typeof d !== 'object' || !Array.isArray(d.placements)) return sol
  const kinds = new Set(level.inventory.map((i) => i.kind))
  for (const p of d.placements as Partial<Placement>[]) {
    if (!p || typeof p !== 'object' || !p.kind || !kinds.has(p.kind) || typeof p.id !== 'string') continue
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isInteger(p.rot) || typeof p.flip !== 'boolean') continue
    const settings = p.settings && typeof p.settings === 'object' ? p.settings : {}
    const next = addPart(level, sol, { id: p.id, kind: p.kind, x: p.x!, y: p.y!, rot: p.rot!, flip: p.flip, settings })
    if (next) sol = next
  }
  // Links are re-added through addLink, so each must still join two compatible anchors of kept parts.
  for (const l of Array.isArray(d.links) ? (d.links as Partial<Link>[]) : []) {
    if (!l || typeof l !== 'object' || !isAnchor(l.a) || !isAnchor(l.b)) continue
    const next = addLink(level, sol, l.a, l.b)
    const added = next?.links[next.links.length - 1]
    if (!next || !added || added.kind !== l.kind) continue
    // Keep the saved id when it is still free.
    if (typeof l.id === 'string' && ![...level.fixedLinks, ...sol.links].some((q) => q.id === l.id)) added.id = l.id
    sol = next
  }
  return sol
}
