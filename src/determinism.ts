import { runUntilGoal } from './game/simulation'
import type { Solution } from './level/types'
import { loadLevels } from './ui/levels'
import { runAll } from '../tests/engine/scenarios'

const out = document.querySelector<HTMLPreElement>('#out')
if (out) out.textContent = JSON.stringify(runAll(1200))

/** Every shipped level replayed with its reference solution: { id: { met, step, hash } }. */
const refs = import.meta.glob<{ solution: Solution }>('../levels/*.solution.json', { eager: true, import: 'default' })
const levelsOut = document.querySelector<HTMLPreElement>('#levels')
if (levelsOut) {
  const result: Record<string, ReturnType<typeof runUntilGoal>> = {}
  for (const level of loadLevels()) {
    const ref = refs[`../levels/${level.id}.solution.json`]
    if (ref) result[level.id] = runUntilGoal(level, ref.solution)
  }
  levelsOut.textContent = JSON.stringify(result)
}
