import { type Vec, add, rotate, v } from '../engine/vec'
import { bodyPose } from '../engine/world'
import type { Pen, PartDrawState } from '../render/pen'
import { angleOf } from './common'

export interface Pose { x: number; y: number; angle: number }

/** Live pose of the n-th body when simulating, else the placement's own pose. */
export function poseOf(s: PartDrawState, n = 0): Pose {
  const b = s.inst?.bodies[n]
  if (b) return bodyPose(b)
  return { x: s.placement.x, y: s.placement.y, angle: angleOf(s.placement) }
}

/** Local points to world points under a pose. */
export const toWorld = (pose: Pose, pts: Vec[]): Vec[] =>
  pts.map((p) => add(v(pose.x, pose.y), rotate(p, pose.angle)))

export const rectPts = (w: number, h: number): Vec[] => [v(-w / 2, -h / 2), v(w / 2, -h / 2), v(w / 2, h / 2), v(-w / 2, h / 2)]

/** n + 1 points on the ellipse arc centred at cx, cy from angle a0 to a1 (radians, y down). */
export const arcPts = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 12): Vec[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n
    return v(cx + rx * Math.cos(a), cy + ry * Math.sin(a))
  })

/** Applies the part's glow (cyan) to the pen. Call after pen.reset. */
export function applyGlow(pen: Pen, s: PartDrawState): void {
  const g = s.inst?.glow ?? 0
  if (g > 0) pen.glow(g, 'cyan')
}

/**
 * Blueprint section hatching: 45° lines `spacing` units apart inside the w×h rectangle centred on
 * the pose, sloping up to the right (dir 1) or down (dir -1), drawn thin.
 */
export function hatch(pen: Pen, pose: Pose, w: number, h: number, spacing: number, dir: 1 | -1 = 1): void {
  const hw = w / 2
  const hh = h / 2
  const step = spacing * Math.SQRT2
  const width = pen.ctx.lineWidth
  pen.ctx.lineWidth = Math.min(width, 0.8)
  // lines x + dir·y = k, clipped to |x| ≤ hw and |y| ≤ hh
  for (let k = -(hw + hh) + step / 2; k < hw + hh; k += step) {
    const lo = Math.max(-hh, dir === 1 ? k - hw : -k - hw)
    const hi = Math.min(hh, dir === 1 ? k + hw : -k + hw)
    if (hi - lo < 0.5) continue
    const [a, b] = toWorld(pose, [v(k - dir * lo, lo), v(k - dir * hi, hi)])
    pen.line(a, b)
  }
  pen.ctx.lineWidth = width
}
