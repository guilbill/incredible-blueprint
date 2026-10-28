import { LEVELS_KEY, storage } from '../storage'
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
