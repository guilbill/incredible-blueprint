import { storage } from '../storage'

export const MUTE_KEY = 'tim.mute'
/** Contacts softer than this make no sound. */
export const TICK_MIN_IMPULSE = 20
/** Impulse (kg·units/s) at which a tick reaches full volume. */
export const TICK_MAX_IMPULSE = 600
export const TICKS_PER_SECOND = 12

/** Tick volume in 0..1 for a contact impulse; 0 below the threshold. Square-rooted so soft hits stay audible. */
export function impulseVolume(impulse: number): number {
  if (!(impulse > TICK_MIN_IMPULSE)) return 0
  const t = Math.min(1, (impulse - TICK_MIN_IMPULSE) / (TICK_MAX_IMPULSE - TICK_MIN_IMPULSE))
  return 0.15 + 0.85 * Math.sqrt(t)
}

/** At most `perSecond` passes per second; `now` is in milliseconds. */
export function createThrottle(perSecond: number): (now: number) => boolean {
  const gap = 1000 / perSecond
  let last = -Infinity
  return (now) => {
    if (now - last < gap) return false
    last = now
    return true
  }
}

export function loadMuted(): boolean {
  return storage.get<unknown>(MUTE_KEY, false) === true
}

export function saveMuted(muted: boolean): void {
  storage.set(MUTE_KEY, muted)
}

/**
 * Turns per-step contact impulses into "new impacts": a pair counts when its impulse crosses the
 * threshold after being below it (or absent) on the previous step, so resting contact stays silent.
 * Returns the strongest new impulse of the step, or 0.
 */
export function createImpactTracker(min = TICK_MIN_IMPULSE): (contacts: Iterable<{ key: string; impulse: number }>) => number {
  let hot = new Set<string>()
  return (contacts) => {
    const now = new Set<string>()
    let best = 0
    for (const c of contacts) {
      if (!(c.impulse > min)) continue
      now.add(c.key)
      if (!hot.has(c.key)) best = Math.max(best, c.impulse)
    }
    hot = now
    return best
  }
}
