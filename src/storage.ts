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

/** Shipped levels that changed id (two levels were inserted at 04 and 05): progress saved under the old id follows. */
const RENAMED_LEVELS: Record<string, string> = {
  '04-petit-moteur': '06-petit-moteur',
  '05-engrenages': '07-engrenages',
  '06-coupez': '08-coupez',
  '07-montgolfiere': '09-montgolfiere',
  '08-chat-et-souris': '10-chat-et-souris',
  '09-attraction': '11-attraction',
  '10-la-grande-machine': '12-la-grande-machine',
  '11-ricochets': '13-ricochets',
  '12-catapulte': '14-catapulte',
  '13-contrepoids': '15-contrepoids',
  '14-deux-tapis': '16-deux-tapis',
  '15-le-tamis': '17-le-tamis',
  '16-debout-le-chat': '18-debout-le-chat',
  '17-le-bocal': '19-le-bocal',
  '18-le-singe-livreur': '20-le-singe-livreur',
  '19-fromage-volant': '21-fromage-volant',
  '20-le-chat-pecheur': '22-le-chat-pecheur',
  '21-seau-aimante': '23-seau-aimante',
  '22-passe-muraille': '24-passe-muraille',
  '23-saute-mouton': '25-saute-mouton',
  '24-coup-de-vent': '26-coup-de-vent',
  '25-plafond': '27-plafond',
  '26-le-gouter': '28-le-gouter',
  '27-chat-perche': '29-chat-perche',
  '28-double-traversee': '30-double-traversee',
  '29-relais': '31-relais',
  '30-la-machine-infernale': '32-la-machine-infernale',
}
const renamed = (id: string): string => (Object.prototype.hasOwnProperty.call(RENAMED_LEVELS, id) ? RENAMED_LEVELS[id] : id)

export function loadProgress(): Progress {
  const p = storage.get<Partial<Progress> | null>(PROGRESS_KEY, null)
  const solved = Array.isArray(p?.solved) ? [...new Set(p.solved.filter((s): s is string => typeof s === 'string').map(renamed))] : []
  const stored = p?.drafts && typeof p.drafts === 'object' && !Array.isArray(p.drafts) ? p.drafts : {}
  const drafts: Record<string, Solution> = {}
  for (const [id, sol] of Object.entries(stored)) drafts[renamed(id)] ??= sol
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
