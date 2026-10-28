import { dot, sub, type Vec } from '../engine/vec'
import { canPlace, footprint, snap } from '../level/placement'
import type { Level, PartKind, Placement, Solution } from '../level/types'
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

export function addPart(level: Level, sol: Solution, p: Placement): Solution | null {
  if ((remaining(level, sol).get(p.kind) ?? 0) <= 0) return null
  if (all(level, sol).some((q) => q.id === p.id)) return null
  if (!canPlace(p, all(level, sol))) return null
  return { ...sol, placements: [...sol.placements, p] }
}

/** Replaces the player placement with the same id, if the new one can be placed. */
export function updatePart(level: Level, sol: Solution, p: Placement): Solution | null {
  if (!sol.placements.some((q) => q.id === p.id)) return null
  if (!canPlace(p, all(level, sol))) return null
  return { ...sol, placements: sol.placements.map((q) => (q.id === p.id ? p : q)) }
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
  return sol
}
