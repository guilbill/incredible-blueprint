export const STEP_MS = 1000 / 120
export const MAX_STEPS_PER_FRAME = 8

/**
 * Fixed-step accumulator: adds the frame's elapsed time, returns how many 120 Hz steps to run
 * (at most 8) and the leftover time. When the cap is hit the backlog is dropped, so a slow frame
 * slows the machine down instead of making it jump.
 */
export function stepsDue(acc: number, dtMs: number): { steps: number; acc: number } {
  const total = acc + Math.max(0, dtMs)
  const steps = Math.floor(total / STEP_MS)
  if (steps > MAX_STEPS_PER_FRAME) return { steps: MAX_STEPS_PER_FRAME, acc: 0 }
  return { steps, acc: total - steps * STEP_MS }
}
