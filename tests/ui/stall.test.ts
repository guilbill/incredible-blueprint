import { describe, expect, it } from 'vitest'
import { LONG_RUN_STEPS, MOVING_SPEED, STILL_STEPS, anyMoving, createStallWatch } from '../../src/ui/stall'

describe('stall watch', () => {
  it('ignores jitter below the moving speed', () => {
    expect(anyMoving([0, MOVING_SPEED, 1])).toBe(false)
    expect(anyMoving([0, MOVING_SPEED + 1])).toBe(true)
    expect(anyMoving([])).toBe(false)
  })

  it('prompts after two seconds without a travelling body, and drops it when something moves again', () => {
    const watch = createStallWatch()
    let r
    for (let i = 1; i < STILL_STEPS; i++) r = watch(false, i)
    expect(r).toBeUndefined()
    expect(watch(false, STILL_STEPS)).toBe('still')
    expect(watch(true, STILL_STEPS + 1)).toBeUndefined()
  })

  it('prompts after a long run even while things keep moving', () => {
    const watch = createStallWatch()
    expect(watch(true, LONG_RUN_STEPS - 1)).toBeUndefined()
    expect(watch(true, LONG_RUN_STEPS)).toBe('long')
  })
})
