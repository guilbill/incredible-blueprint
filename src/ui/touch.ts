import { FIELD } from '../level/placement'
import { HANDLE_HIT } from './edit'

/** Radius (CSS pixels) a fingertip needs around a handle. */
export const TOUCH_HIT_PX = 22
/** How long (ms) a finger stays still before a press opens the menu. */
export const LONG_PRESS_MS = 500
/** How far (CSS pixels) a finger may drift and still be a long press. */
export const LONG_PRESS_SLOP = 10

/** Handle tolerance in units for a press of `pointerType` on a board drawn `cssW` pixels wide. */
export function handleTolerance(pointerType: string, cssW: number): number {
  if (pointerType !== 'touch' || cssW <= 0) return HANDLE_HIT
  return Math.max(HANDLE_HIT, (TOUCH_HIT_PX * FIELD.w) / cssW)
}

/** The device's main pointer is a finger (tablet, phone): touch controls and gesture help instead of shortcuts. */
export function touchUi(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
}

/**
 * Long press of one finger: `fire` runs after LONG_PRESS_MS unless the finger moved more than
 * LONG_PRESS_SLOP or `cancel` was called first (finger up, gesture cancelled).
 */
export function createLongPress(fire: (at: { x: number; y: number }) => void): {
  start(at: { x: number; y: number }): void
  move(at: { x: number; y: number }): void
  cancel(): void
} {
  let from: { x: number; y: number } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = (): void => {
    clearTimeout(timer)
    from = undefined
  }
  return {
    start(at) {
      cancel()
      from = at
      timer = setTimeout(() => {
        from = undefined
        fire(at)
      }, LONG_PRESS_MS)
    },
    move(at) {
      if (!from) return
      const dx = at.x - from.x
      const dy = at.y - from.y
      if (dx * dx + dy * dy > LONG_PRESS_SLOP * LONG_PRESS_SLOP) cancel()
    },
    cancel,
  }
}
