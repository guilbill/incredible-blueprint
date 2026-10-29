import { t } from '../i18n'
import { LIMITS } from '../level/codec'
import { canPlace, snap } from '../level/placement'
import type { Goal, Level, Link, PartKind, Placement, Rect, Solution } from '../level/types'
import { canLink } from '../parts/mech/links'
import { PART_DEFS } from '../parts/registry'

/** Every registered part kind, in registry order (the order of the editor's lists). */
export const ALL_KINDS = Object.keys(PART_DEFS) as PartKind[]

export function blankLevel(id: string): Level {
  return { v: 1, id, title: t('editor.newLevel'), goalText: '', fixed: [], fixedLinks: [], inventory: [], goals: [], verified: false }
}

/**
 * The level being authored. Every edit goes through a method here and clears `verified`: only a
 * win in test mode (`onTestWin`) sets it again, and sharing needs it.
 */
export class EditorModel {
  level: Level
  /** The player solution that won the last test, until the next edit. */
  solution?: Solution

  constructor(level: Level) {
    this.level = structuredClone({ ...level, verified: level.verified ?? false })
  }

  /** A level with no goal is "won" on the first step, so it can be neither tested nor shared. */
  get canTest(): boolean {
    return this.level.goals.length > 0
  }

  get canShare(): boolean {
    return this.level.verified === true && this.canTest
  }

  markDirty(): void {
    this.level.verified = false
    this.solution = undefined
  }

  onTestWin(sol: Solution): void {
    if (!this.canTest) return
    this.level.verified = true
    this.solution = structuredClone(sol)
  }

  addFixed(p: Placement): boolean {
    if (this.level.fixed.some((q) => q.id === p.id) || !canPlace(p, this.level.fixed)) return false
    this.level.fixed.push(structuredClone(p))
    this.markDirty()
    return true
  }

  moveFixed(id: string, x: number, y: number): boolean {
    const p = this.level.fixed.find((q) => q.id === id)
    if (!p) return false
    const moved = { ...p, x: snap(x), y: snap(y) }
    if (!canPlace(moved, this.level.fixed)) return false
    this.level.fixed = this.level.fixed.map((q) => (q.id === id ? moved : q))
    this.markDirty()
    return true
  }

  removeFixed(id: string): void {
    this.setFixed(this.level.fixed.filter((p) => p.id !== id), this.level.fixedLinks)
  }

  /**
   * Replaces the fixed parts and links at once (the editor canvas works on whole solutions). Links
   * aiming at a part that is gone (or a belt between gears that now mesh) are dropped, and so are
   * goals aiming at anything dropped, so the level stays valid.
   */
  setFixed(placements: Placement[], links: Link[]): void {
    const ids = new Set(placements.map((p) => p.id))
    this.level.fixed = structuredClone(placements)
    this.level.fixedLinks = structuredClone(links.filter((l) => ids.has(l.a.part) && ids.has(l.b.part) && canLink(l.a, l.b, placements)))
    const targets = new Set([...ids, ...this.level.fixedLinks.map((l) => l.id)])
    this.level.goals = this.level.goals.filter((g) => g.part === undefined || targets.has(g.part))
    this.markDirty()
  }

  /** Count 0 (or less) takes the kind out of the player's drawer. */
  setInventory(kind: PartKind, count: number): void {
    const n = Math.max(0, Math.floor(count))
    const rest = this.level.inventory.filter((it) => it.kind !== kind)
    if (n > 0) rest.push({ kind, count: n })
    this.level.inventory = rest.sort((a, b) => ALL_KINDS.indexOf(a.kind) - ALL_KINDS.indexOf(b.kind))
    this.markDirty()
  }

  /** Ids a goal may aim at (the same set validateLevel accepts): fixed parts and fixed links. */
  hasTarget(id: string): boolean {
    return this.level.fixed.some((p) => p.id === id) || this.level.fixedLinks.some((l) => l.id === id)
  }

  /** Refuses (false, nothing changed) a goal aiming at a part that is not there, or past the goal cap: the level would no longer load. */
  addGoal(g: Goal): boolean {
    if (this.level.goals.length >= LIMITS.goals) return false
    if (g.part !== undefined && !this.hasTarget(g.part)) return false
    this.level.goals.push(structuredClone(g))
    this.markDirty()
    return true
  }

  /** Replaces the zone of the inZone goal `i`; false (nothing changed) for an event goal or a bad index. */
  setZone(i: number, zone: Rect): boolean {
    const g = this.level.goals[i]
    if (g?.type !== 'inZone') return false
    this.level.goals[i] = { ...g, zone: { x: zone.x, y: zone.y, w: zone.w, h: zone.h } }
    this.markDirty()
    return true
  }

  removeGoal(i: number): void {
    this.level.goals = this.level.goals.filter((_, j) => j !== i)
    this.markDirty()
  }

  setTitle(t: string): void {
    this.level.title = t
    this.markDirty()
  }

  setGoalText(t: string): void {
    this.level.goalText = t
    this.markDirty()
  }
}
