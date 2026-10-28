import { LEVELS_KEY, forgetLevel, storage } from '../storage'
import { validateLevel } from './codec'
import type { Level } from './types'

/** Custom levels saved by the editor; invalid entries are skipped. */
export function loadCustomLevels(): Level[] {
  const raw = storage.get<unknown>(LEVELS_KEY, [])
  return Array.isArray(raw) ? raw.filter((l): l is Level => validateLevel(l) === null) : []
}

/** Adds or replaces (same id) a custom level. */
export function saveCustomLevel(level: Level): boolean {
  const all = loadCustomLevels().filter((l) => l.id !== level.id)
  all.push(level)
  return storage.set(LEVELS_KEY, all)
}

/**
 * Removes a custom level and its progress (solved mark, draft). Other stored entries are kept as
 * they are, even ones this version cannot read.
 */
export function deleteCustomLevel(id: string): boolean {
  const raw = storage.get<unknown>(LEVELS_KEY, [])
  const rest = Array.isArray(raw) ? raw.filter((l) => !(typeof l === 'object' && l !== null && (l as { id?: unknown }).id === id)) : []
  const ok = storage.set(LEVELS_KEY, rest)
  return forgetLevel(id) && ok
}
