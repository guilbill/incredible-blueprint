import { dynamicCircle } from '../../engine/bodies'
import type { PartKind } from '../../level/types'
import { CELL, DENSITY, instance, pos } from '../common'
import type { PartDef } from '../types'
import { v } from '../../engine/vec'
import { applyGlow, poseOf, toWorld } from '../drawing'

export type BallLook = 'bowling' | 'baseball' | 'basket' | 'tennis'

type Pt = [number, number]

/** `n + 1` points along a quadratic curve. */
function quad(p0: Pt, p1: Pt, p2: Pt, n = 4): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]])
  }
  return out
}

/** `n + 1` points along a cubic curve. */
function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 5): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]])
  }
  return out
}

/** Stitch ticks of one baseball seam: start and offset, in the design grid (r = 8). */
const STITCHES: [Pt, Pt][] = [
  [[-5.2, -3.6], [1.6, -0.6]],
  [[-4.4, -1.2], [1.7, 0]],
  [[-4.4, 1.2], [1.7, 0]],
  [[-5.2, 3.6], [1.6, 0.6]],
]

/** `metal` balls are pulled by magnets. */
function ball(kind: PartKind, label: string, r: number, density: number, restitution: number, metal: boolean, look: BallLook): PartDef {
  const d = (2 * r) / CELL
  return {
    kind,
    label,
    size: { w: d, h: d },
    rotStep: 0,
    flippable: false,
    settings: [],
    anchors: [{ key: 'center', local: v(0, 0), role: 'rope' }],
    draw(pen, s) {
      pen.reset()
      applyGlow(pen, s)
      const pose = poseOf(s)
      // Design coordinates (see the look's grid size), scaled to r and rotated with the ball.
      const g = look === 'baseball' ? 8 : look === 'tennis' ? 7 : 14
      const k = r / g
      const w = (pts: Pt[]) => toWorld(pose, pts.map(([x, y]) => v(x * k, y * k)))
      const path = (pts: Pt[]) => pen.path(w(pts))
      const seg = (a: Pt, b: Pt) => {
        const [p, q] = w([a, b])
        pen.line(p, q)
      }
      pen.circle(v(pose.x, pose.y), r)
      if (look === 'bowling') {
        pen.circle(v(pose.x, pose.y), r - 1.5)
        for (const [c, hr] of [[[-4, -5], 2], [[3, -6.5], 2], [[-1, 1], 2.4]] as [Pt, number][]) {
          pen.circle(w([c])[0], hr * k)
        }
      } else if (look === 'baseball') {
        path(quad([-5.5, -5.8], [-2.5, 0], [-5.5, 5.8]))
        path(quad([5.5, -5.8], [2.5, 0], [5.5, 5.8]))
        for (const [[x, y], [dx, dy]] of STITCHES) {
          seg([x, y], [x + dx, y + dy])
          seg([-x, y], [-x - dx, y + dy])
        }
      } else if (look === 'basket') {
        seg([-14, 0], [14, 0])
        seg([0, -14], [0, 14])
        path(quad([-9, -10.7], [-3, 0], [-9, 10.7]))
        path(quad([9, -10.7], [3, 0], [9, 10.7]))
      } else {
        path(cubic([-6.4, -2.8], [-2.5, -1], [-2.5, 4.5], [-2.6, 6.5]))
        path(cubic([6.4, 2.8], [2.5, 1], [2.5, -4.5], [2.6, -6.5]))
      }
    },
    build({ world }, p) {
      const b = dynamicCircle(world, pos(p), r, {
        density: density * DENSITY,
        restitution,
        friction: 0.4,
        data: { part: p.id, tags: metal ? ['ball', 'metal'] : ['ball'] },
      })
      return instance(p, [b], { center: { body: b, local: v(0, 0), radius: 0 } })
    },
  }
}

export const BALLS: PartDef[] = [
  ball('ball-bowling', 'Boule de bowling', 14, 3, 0.1, true, 'bowling'),
  ball('ball-base', 'Balle de baseball', 8, 1, 0.5, true, 'baseball'),
  ball('ball-basket', 'Ballon de basket', 14, 0.3, 0.8, false, 'basket'),
  ball('ball-tennis', 'Balle de tennis', 7, 0.4, 0.75, false, 'tennis'),
]
