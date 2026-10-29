/**
 * "Try again?" prompt while a machine runs: shown once nothing has moved across the board for a
 * while, or after a long run without reaching the goal. Parts turning in place (gears, pulleys,
 * wheels) do not count as moving, only bodies whose centre travels.
 */

/** Steps (at 120 per second) without any travelling body before the prompt: 2 s. */
export const STILL_STEPS = 240
/** Steps after which the prompt shows even if something still moves: 45 s. */
export const LONG_RUN_STEPS = 5400
/** Speed (units/s) below which a body counts as stopped. */
export const MOVING_SPEED = 5

export type StallReason = 'still' | 'long'

/** True when one of the given speeds (units/s) is a real move, not jitter. */
export function anyMoving(speeds: Iterable<number>): boolean {
  for (const s of speeds) if (s > MOVING_SPEED) return true
  return false
}

/** Feed it once per step; it says whether to show the prompt, and why. */
export function createStallWatch(): (moving: boolean, step: number) => StallReason | undefined {
  let still = 0
  return (moving, step) => {
    still = moving ? 0 : still + 1
    if (still >= STILL_STEPS) return 'still'
    if (step >= LONG_RUN_STEPS) return 'long'
    return undefined
  }
}
