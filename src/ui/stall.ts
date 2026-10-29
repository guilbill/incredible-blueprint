/**
 * "Try again?" prompt while a machine runs: shown once nothing has moved across the board for a
 * while, or after a long run without reaching the goal. Parts turning in place (gears, pulleys,
 * wheels) do not count as moving, only bodies whose centre travels.
 */

/** Steps (at 120 per second) without any travelling body before the prompt: 2 s. */
export const STILL_STEPS = 240
/** Steps with motion only off the board (a ball fallen out of view) before the prompt: 10 s. */
export const OFFSCREEN_STEPS = 1200
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

/**
 * Feed it once per step with whether something moves at all and whether something moves on the
 * board; it says whether to show the prompt, and why.
 */
export function createStallWatch(): (moving: { any: boolean; onBoard: boolean }, step: number) => StallReason | undefined {
  let still = 0
  let offBoard = 0
  return (moving, step) => {
    still = moving.any ? 0 : still + 1
    offBoard = moving.onBoard ? 0 : offBoard + 1
    if (still >= STILL_STEPS || offBoard >= OFFSCREEN_STEPS) return 'still'
    if (step >= LONG_RUN_STEPS) return 'long'
    return undefined
  }
}
