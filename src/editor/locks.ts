import type { Placement } from '../level/types'
import { storage } from '../storage'

/** Author-side lock marks, per level id. Never part of a level: not exported, not shared. */
export const LOCKS_KEY = 'tim.locks'

function all(): Record<string, string[]> {
  const raw = storage.get<unknown>(LOCKS_KEY, {})
  const out: Record<string, string[]> = {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out
  for (const [id, ids] of Object.entries(raw)) {
    if (Array.isArray(ids)) out[id] = ids.filter((s): s is string => typeof s === 'string')
  }
  return out
}

export function loadLocks(levelId: string): Set<string> {
  return new Set(all()[levelId] ?? [])
}

export function saveLocks(levelId: string, ids: ReadonlySet<string>): void {
  const rest = all()
  if (ids.size) rest[levelId] = [...ids]
  else delete rest[levelId]
  storage.set(LOCKS_KEY, rest)
}

export function copyLocks(fromId: string, toId: string): void {
  saveLocks(toId, loadLocks(fromId))
}

export function forgetLocks(levelId: string): void {
  saveLocks(levelId, new Set())
}

/** The locks whose part still exists. */
export function pruneLocks(locks: ReadonlySet<string>, placements: Placement[]): Set<string> {
  const ids = new Set(placements.map((p) => p.id))
  return new Set([...locks].filter((id) => ids.has(id)))
}
