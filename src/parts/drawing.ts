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

/** Applies the part's glow (cyan) to the pen. Call after pen.reset. */
export function applyGlow(pen: Pen, s: PartDrawState): void {
  const g = s.inst?.glow ?? 0
  if (g > 0) pen.glow(g, 'cyan')
}
