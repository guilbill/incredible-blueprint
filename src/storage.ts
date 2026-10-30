import type { Solution } from './level/types'

/**
 * localStorage behind try/catch: a private window, a full quota or a disabled storage only means
 * nothing is kept. Nothing here ever throws.
 */
export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = globalThis.localStorage.getItem(key)
      return raw === null ? fallback : (JSON.parse(raw) as T)
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown): boolean {
    try {
      globalThis.localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  },
}

export const PROGRESS_KEY = 'tim.progress'
/** Custom levels from the editor (Task 12). */
export const LEVELS_KEY = 'tim.levels'

/** Set once the player has left the welcome machine (by solving it or by going to the levels). */
export const WELCOMED_KEY = 'tim.welcomed'

export interface Progress { solved: string[]; drafts: Record<string, Solution> }

export function loadProgress(): Progress {
  const p = storage.get<Partial<Progress> | null>(PROGRESS_KEY, null)
  const solved = Array.isArray(p?.solved) ? p.solved.filter((s): s is string => typeof s === 'string') : []
  const drafts = p?.drafts && typeof p.drafts === 'object' && !Array.isArray(p.drafts) ? p.drafts : {}
  return { solved, drafts }
}

export function markSolved(levelId: string): boolean {
  const p = loadProgress()
  if (!p.solved.includes(levelId)) p.solved.push(levelId)
  return storage.set(PROGRESS_KEY, p)
}

/** Drops a level's solved mark and draft (used when a custom level is deleted). */
export function forgetLevel(levelId: string): boolean {
  const p = loadProgress()
  const drafts = { ...p.drafts }
  delete drafts[levelId]
  return storage.set(PROGRESS_KEY, { solved: p.solved.filter((s) => s !== levelId), drafts })
}

export function saveDraft(levelId: string, sol: Solution): boolean {
  const p = loadProgress()
  p.drafts[levelId] = sol
  return storage.set(PROGRESS_KEY, p)
}

/** First visit: never left the welcome machine and nothing played yet. */
export function isFirstVisit(): boolean {
  if (storage.get(WELCOMED_KEY, false)) return false
  const p = loadProgress()
  return p.solved.length === 0 && Object.keys(p.drafts).length === 0
}

export function markWelcomed(): boolean {
  return storage.set(WELCOMED_KEY, true)
}
