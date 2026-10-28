import { describe, expect, it } from 'vitest'
import { runUntilGoal } from '../../src/game/simulation'
import { canPlace } from '../../src/level/placement'
import type { Level, Placement } from '../../src/level/types'
import { loadLevels } from '../../src/ui/levels'
import sandboxJson from '../../levels/00-sandbox.json'

describe('shipped levels', () => {
  const levels = loadLevels()

  it('loads levels/*.json sorted by file name, without the dev sandbox', () => {
    expect(levels[0].id).toBe('01-premier-plan')
    expect(levels.map((l) => l.id)).not.toContain('00-sandbox')
    expect(levels.every((l) => l.v === 1)).toBe(true)
  })

  it('sandbox: fixed parts are placeable, unsolved alone, solved with one ramp', () => {
    const sandbox = sandboxJson as Level
    for (const p of sandbox.fixed) expect(canPlace(p, sandbox.fixed)).toBe(true)
    expect(runUntilGoal(sandbox, { placements: [], links: [] }, 600).met).toBe(false)
    const ramp: Placement = { id: 'p1', kind: 'ramp', x: 300, y: 450, rot: 1, flip: false, settings: { length: 12 } }
    expect(runUntilGoal(sandbox, { placements: [ramp], links: [] }, 600).met).toBe(true)
  })
})
