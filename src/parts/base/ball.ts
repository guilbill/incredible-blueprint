import { dynamicCircle } from '../../engine/bodies'
import type { PartKind } from '../../level/types'
import { CELL, DENSITY, instance, pos } from '../common'
import type { PartDef } from '../types'
import { v } from '../../engine/vec'
import { applyGlow, poseOf, toWorld } from '../drawing'

function ball(kind: PartKind, label: string, r: number, density: number, restitution: number): PartDef {
  const d = (2 * r) / CELL
  return {
    kind,
    label,
    size: { w: d, h: d },
    rotStep: 0,
    flippable: false,
    settings: [],
    anchors: [],
    draw(pen, s) {
      pen.reset()
      applyGlow(pen, s)
      const pose = poseOf(s)
      pen.circle(pose, r)
      const [a, b] = toWorld(pose, [v(-r, 0), v(r, 0)])
      pen.line(a, b)
      const [c, d] = toWorld(pose, [v(0, -r), v(0, r)])
      pen.line(c, d)
    },
    build({ world }, p) {
      const b = dynamicCircle(world, pos(p), r, {
        density: density * DENSITY,
        restitution,
        friction: 0.4,
        data: { part: p.id, tags: ['ball'] },
      })
      return instance(p, [b])
    },
  }
}

export const BALLS: PartDef[] = [
  ball('ball-bowling', 'Boule de bowling', 14, 3, 0.1),
  ball('ball-base', 'Balle de baseball', 8, 1, 0.5),
  ball('ball-basket', 'Ballon de basket', 14, 0.3, 0.8),
  ball('ball-tennis', 'Balle de tennis', 7, 0.4, 0.75),
]
