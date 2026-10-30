import { describe, expect, it } from 'vitest'
import { runUntilGoal } from '../../src/game/simulation'
import { REST, SLOT, SNAP_DIST, heldPlank, onPlank, welcomeLevel } from '../../src/ui/welcome'

const none = { placements: [], links: [] }

describe('welcome machine', () => {
  it('the ball reaches the bucket once the plank is in its slot, within 6 s', () => {
    const r = runUntilGoal(welcomeLevel(SLOT), none, 120 * 6)
    expect(r.met).toBe(true)
  })

  it('nothing wins with the plank left on the floor', () => {
    expect(runUntilGoal(welcomeLevel(REST), none, 120 * 10).met).toBe(false)
  })

  it('a plank held near the slot snaps into it, elsewhere it lies flat under the pointer', () => {
    expect(heldPlank({ x: SLOT.x + SNAP_DIST - 1, y: SLOT.y })).toBe(SLOT)
    expect(heldPlank({ x: SLOT.x + SNAP_DIST + 1, y: SLOT.y })).toEqual({ ...REST, x: SLOT.x + SNAP_DIST + 1, y: SLOT.y })
  })

  it('grabs the plank along its length, not beside it', () => {
    expect(onPlank(REST, { x: REST.x + 90, y: REST.y + 5 })).toBe(true)
    expect(onPlank(REST, { x: REST.x, y: REST.y - 40 })).toBe(false)
    expect(onPlank(SLOT, { x: SLOT.x + 90 * Math.cos(Math.PI / 12), y: SLOT.y + 90 * Math.sin(Math.PI / 12) })).toBe(true)
  })
})
