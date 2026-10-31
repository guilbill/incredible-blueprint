import { describe, expect, it } from 'vitest'
import { runUntilGoal } from '../../src/game/simulation'
import { FLAT, SLOT, SNAP_DIST, heldPlank, welcomeLevel } from '../../src/ui/welcome'

const none = { placements: [], links: [] }

describe('welcome machine', () => {
  it('the ball reaches the bucket once the plank is in its slot, within 6 s', () => {
    const r = runUntilGoal(welcomeLevel(SLOT), none, 120 * 6)
    expect(r.met).toBe(true)
  })

  it('nothing wins with the plank left in the drawer', () => {
    expect(runUntilGoal(welcomeLevel(null), none, 120 * 10).met).toBe(false)
  })

  it('a plank held near the slot snaps into it, elsewhere it lies flat under the pointer', () => {
    expect(heldPlank({ x: SLOT.x + SNAP_DIST - 1, y: SLOT.y })).toBe(SLOT)
    expect(heldPlank({ x: SLOT.x + SNAP_DIST + 1, y: SLOT.y })).toEqual({ ...FLAT, x: SLOT.x + SNAP_DIST + 1, y: SLOT.y })
  })
})
