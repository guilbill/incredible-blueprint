import type { PartKind } from '../level/types'
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
 * Returns the strongest new contact of the step, or undefined.
 */
export function createImpactTracker<C extends { key: string; impulse: number }>(min = TICK_MIN_IMPULSE): (contacts: Iterable<C>) => C | undefined {
  let hot = new Set<string>()
  return (contacts) => {
    const now = new Set<string>()
    let best: C | undefined
    for (const c of contacts) {
      if (!(c.impulse > min)) continue
      now.add(c.key)
      if (!hot.has(c.key) && (!best || c.impulse > best.impulse)) best = c
    }
    hot = now
    return best
  }
}

/** Sound of a contact, from the kinds of the two parts touching. */
export type ImpactVoice = 'trampoline' | 'ball-bowling' | 'ball-basket' | 'ball-base' | 'ball-tennis' | 'wall-brick' | 'wall-wood' | 'tick'

/** Most telling material first: the trampoline, then the balls (heaviest first), then the walls. */
const IMPACT_ORDER: ImpactVoice[] = ['trampoline', 'ball-bowling', 'ball-basket', 'ball-base', 'ball-tennis', 'wall-brick', 'wall-wood']

export function impactVoice(kinds: readonly (string | undefined)[]): ImpactVoice {
  return IMPACT_ORDER.find((v) => kinds.includes(v)) ?? 'tick'
}

/** Parts that sound continuously while they turn or blow; one loop per name, however many parts. */
export type LoopName = 'gears' | 'pulley' | 'conveyor' | 'magnet' | 'fan'
const LOOP_OF: Partial<Record<PartKind, LoopName>> = {
  'gear-small': 'gears',
  'gear-large': 'gears',
  pulley: 'pulley',
  conveyor: 'conveyor',
  magnet: 'magnet',
  fan: 'fan',
}

export const loopOf = (kind: PartKind): LoopName | undefined => LOOP_OF[kind]

/** Glow above this means the part is still at work (it re-lights every step while active). */
export const ACTIVE_GLOW = 0.5

/** Loops to play this step: those of the parts still glowing. */
export function activeLoops(parts: Iterable<{ kind: PartKind; glow: number }>): Set<LoopName> {
  const out = new Set<LoopName>()
  for (const p of parts) {
    const l = loopOf(p.kind)
    if (l && p.glow > ACTIVE_GLOW) out.add(l)
  }
  return out
}

/**
 * Parts that just started (their glow jumped from idle to lit), for one-shot sounds. Parts that
 * re-light every step while running only count once, when they start.
 */
export function startedParts<P extends { id: string; kind: PartKind; glow: number }>(prev: ReadonlyMap<string, number>, parts: Iterable<P>): P[] {
  const out: P[] = []
  for (const p of parts) if (p.glow > ACTIVE_GLOW && (prev.get(p.id) ?? 0) <= ACTIVE_GLOW && !loopOf(p.kind)) out.push(p)
  return out
}
