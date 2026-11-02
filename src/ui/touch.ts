import { FIELD } from '../level/placement'
import { END_GAP, HANDLE_HIT, MOUSE_GAPS, ROT_GAP, type HandleGaps } from './edit'

/** Radius (CSS pixels) a fingertip needs around a handle. */
export const TOUCH_HIT_PX = 22
/** How long (ms) a finger stays still before a press opens the menu. */
export const LONG_PRESS_MS = 500
/** How far (CSS pixels) a finger may drift and still be a long press. */
export const LONG_PRESS_SLOP = 10

/** Units covered by `px` CSS pixels on a board drawn `cssW` pixels wide. */
const unitsOf = (px: number, cssW: number): number => (px * FIELD.w) / cssW

/** Handle tolerance in units for a press of `pointerType` on a board drawn `cssW` pixels wide. */
export function handleTolerance(pointerType: string, cssW: number): number {
  if (pointerType !== 'touch' || cssW <= 0) return HANDLE_HIT
  return Math.max(HANDLE_HIT, unitsOf(TOUCH_HIT_PX, cssW))
}

/** Handles for a finger, in CSS pixels: the rotate handle this far off the part, the length handles past its ends. */
export const FINGER_ROT_GAP_PX = 50
export const FINGER_END_GAP_PX = 26
/** How far (CSS pixels) a part dragged by a finger rides above it, so the finger does not hide it. */
export const FINGER_LIFT_PX = 50

/** Handle gaps for a board drawn `cssW` pixels wide: set apart from the part for a finger, never closer than with a mouse. */
export function handleGaps(finger: boolean, cssW: number): HandleGaps {
  if (!finger || cssW <= 0) return MOUSE_GAPS
  return { rot: Math.max(ROT_GAP, unitsOf(FINGER_ROT_GAP_PX, cssW)), end: Math.max(END_GAP, unitsOf(FINGER_END_GAP_PX, cssW)) }
}

/** Lift (units) of a part dragged by a finger on a board drawn `cssW` pixels wide; 0 for a mouse. */
export function fingerLift(finger: boolean, cssW: number): number {
  return finger && cssW > 0 ? unitsOf(FINGER_LIFT_PX, cssW) : 0
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
