import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HANDLE_HIT } from '../../src/ui/edit'
import { FIELD } from '../../src/level/placement'
import { createLongPress, handleTolerance, LONG_PRESS_MS, TOUCH_HIT_PX } from '../../src/ui/touch'
import { allGestures } from '../../src/ui/shortcuts'

describe('handleTolerance', () => {
  it('keeps the mouse tolerance for a mouse or a pen', () => {
    expect(handleTolerance('mouse', 300)).toBe(HANDLE_HIT)
    expect(handleTolerance('pen', 300)).toBe(HANDLE_HIT)
  })

  it('gives a finger TOUCH_HIT_PX on screen, whatever the board size', () => {
    expect(handleTolerance('touch', FIELD.w / 2)).toBeCloseTo(TOUCH_HIT_PX * 2)
    // a huge board never shrinks it below the mouse tolerance
    expect(handleTolerance('touch', FIELD.w * 100)).toBe(HANDLE_HIT)
  })
})

describe('createLongPress', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fires once the finger stayed still long enough', () => {
    const fire = vi.fn()
    const lp = createLongPress(fire)
    lp.start({ x: 10, y: 10 })
    lp.move({ x: 14, y: 13 })
    vi.advanceTimersByTime(LONG_PRESS_MS - 1)
    expect(fire).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fire).toHaveBeenCalledWith({ x: 10, y: 10 })
  })

  it('gives up when the finger drags or lifts', () => {
    const fire = vi.fn()
    const lp = createLongPress(fire)
    lp.start({ x: 10, y: 10 })
    lp.move({ x: 30, y: 10 })
    vi.advanceTimersByTime(LONG_PRESS_MS)
    lp.start({ x: 10, y: 10 })
    lp.cancel()
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(fire).not.toHaveBeenCalled()
  })
})

describe('allGestures', () => {
  it('names the long press menu and the add button', () => {
    const list = allGestures()
    expect(list.find((g) => g.gesture === 'appui long')?.label).toMatch(/^menu/)
    expect(list.find((g) => g.icon === 'select-add')?.label).toBe('ajouter à la sélection')
  })
})
