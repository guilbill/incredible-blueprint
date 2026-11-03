import { describe, expect, it } from 'vitest'
import { FOCUS_FADE_IN_MS, FOCUS_FADE_OUT_MS, FOCUS_HOLD_MS, focusStep } from '../../src/ui/goalFocus'

describe('goal highlight', () => {
  it('stays full while the level opens, then fades out', () => {
    expect(focusStep(1, 16, FOCUS_HOLD_MS - 1, false)).toBe(1)
    expect(focusStep(1, FOCUS_FADE_OUT_MS / 2, FOCUS_HOLD_MS + 1, false)).toBeCloseTo(0.5)
    expect(focusStep(0.1, FOCUS_FADE_OUT_MS, FOCUS_HOLD_MS * 4, false)).toBe(0)
  })

  it('comes back while the brief is hovered', () => {
    expect(focusStep(0, FOCUS_FADE_IN_MS / 2, 60_000, true)).toBeCloseTo(0.5)
    expect(focusStep(0.9, FOCUS_FADE_IN_MS, 60_000, true)).toBe(1)
  })
})
