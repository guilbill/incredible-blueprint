/** Goal highlight on the board: full when the level opens, then it fades; it comes back while the brief is hovered. */
export const FOCUS_HOLD_MS = 1500
export const FOCUS_FADE_OUT_MS = 600
export const FOCUS_FADE_IN_MS = 200

/** Strength 0..1 of the highlight `dt` ms after the last frame, `sinceOpen` ms after the level opened. */
export function focusStep(k: number, dt: number, sinceOpen: number, hot: boolean): number {
  if (hot) return Math.min(1, k + dt / FOCUS_FADE_IN_MS)
  if (sinceOpen < FOCUS_HOLD_MS) return 1
  return Math.max(0, k - dt / FOCUS_FADE_OUT_MS)
}
