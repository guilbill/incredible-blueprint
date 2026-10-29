import { describe, expect, it } from 'vitest'
import { LONG_RUN_STEPS, MOVING_SPEED, OFFSCREEN_STEPS, STILL_STEPS, anyMoving, createStallWatch } from '../../src/ui/stall'

const STILL = { any: false, onBoard: false }
const BOTH = { any: true, onBoard: true }

describe('stall watch', () => {
  it('ignores jitter below the moving speed', () => {
    expect(anyMoving([0, MOVING_SPEED, 1])).toBe(false)
    expect(anyMoving([0, MOVING_SPEED + 1])).toBe(true)
    expect(anyMoving([])).toBe(false)
  })

  it('prompts after two seconds without a travelling body, and drops it when something moves again', () => {
    const watch = createStallWatch()
    let r
    for (let i = 1; i < STILL_STEPS; i++) r = watch(STILL, i)
    expect(r).toBeUndefined()
    expect(watch(STILL, STILL_STEPS)).toBe('still')
    expect(watch(BOTH, STILL_STEPS + 1)).toBeUndefined()
  })

  it('prompts after a long run even while things keep moving', () => {
    const watch = createStallWatch()
    expect(watch(BOTH, LONG_RUN_STEPS - 1)).toBeUndefined()
    expect(watch(BOTH, LONG_RUN_STEPS)).toBe('long')
  })

  it('prompts after ten seconds when the only motion is off the board', () => {
    const watch = createStallWatch()
    const away = { any: true, onBoard: false }
    let r
    for (let i = 1; i < OFFSCREEN_STEPS; i++) r = watch(away, i)
    expect(r).toBeUndefined()
    expect(watch(away, OFFSCREEN_STEPS)).toBe('still')
  })
})
