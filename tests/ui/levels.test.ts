import { describe, expect, it } from 'vitest'
import { runUntilGoal } from '../../src/game/simulation'
import { canPlace } from '../../src/level/placement'
import type { Placement } from '../../src/level/types'
import { loadLevels } from '../../src/ui/levels'

describe('shipped levels', () => {
  const levels = loadLevels()

  it('loads levels/*.json sorted, sandbox first', () => {
    expect(levels[0].id).toBe('00-sandbox')
    expect(levels.every((l) => l.v === 1)).toBe(true)
  })

  it('sandbox: fixed parts are placeable, unsolved alone, solved with one ramp', () => {
    const sandbox = levels.find((l) => l.id === '00-sandbox')!
    for (const p of sandbox.fixed) expect(canPlace(p, sandbox.fixed)).toBe(true)
    expect(runUntilGoal(sandbox, { placements: [], links: [] }, 600).met).toBe(false)
    const ramp: Placement = { id: 'p1', kind: 'ramp', x: 300, y: 450, rot: 1, flip: false, settings: { length: 12 } }
    expect(runUntilGoal(sandbox, { placements: [ramp], links: [] }, 600).met).toBe(true)
  })
})
