import type { Goal } from '../level/types'
import { toU } from '../engine/world'
import type { Simulation } from './simulation'

const DEFAULT_HOLD = 30

/** True when the goal's condition holds on this step (inZone) or has ever happened (event). */
function goalHolds(g: Goal, sim: Simulation): boolean {
  if (g.type === 'event') return sim.events.some((e) => e.name === g.event && (g.part === undefined || e.part === g.part))
  const body = sim.parts.find((p) => p.id === g.part)?.bodies[0]
  if (!body) return false
  const pos = body.getPosition()
  const x = toU(pos.x)
  const y = toU(pos.y)
  const z = g.zone
  return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h
}

/**
 * Updates `holdCounters` (one per goal, consecutive steps spent in the zone) and returns true when every goal is met.
 * Call once per simulation step.
 */
export function evaluateGoals(goals: Goal[], sim: Simulation, holdCounters: number[]): boolean {
  let all = true
  goals.forEach((g, i) => {
    const holds = goalHolds(g, sim)
    if (g.type === 'event') {
      if (!holds) all = false
      return
    }
    holdCounters[i] = holds ? (holdCounters[i] ?? 0) + 1 : 0
    if (holdCounters[i] < (g.hold ?? DEFAULT_HOLD)) all = false
  })
  return all
}
