import { staticBox } from '../../engine/bodies'
import { v } from '../../engine/vec'
import type { PartKind } from '../../level/types'
import { CELL, angleOf, instance, pos, setting } from '../common'
import type { PartDef, SettingDef } from '../types'
import { applyGlow, hatch, poseOf, rectPts, toWorld } from '../drawing'

const LENGTH: SettingDef = { key: 'length', label: 'Longueur', min: 2, max: 16, step: 1, def: 4 }

/** Upright 1 × length cells at rot 0. */
function wall(kind: PartKind, label: string, friction: number, restitution: number): PartDef {
  return {
    kind,
    label,
    size: { w: 1, h: LENGTH.def },
    sizeOf: (p) => ({ w: 1, h: setting(p, LENGTH) }),
    rotStep: 6,
    flippable: false,
    settings: [LENGTH],
    anchors: [],
    draw(pen, s) {
      pen.reset()
      applyGlow(pen, s)
      const len = setting(s.placement, LENGTH) * CELL
      const pose = poseOf(s)
      pen.poly(toWorld(pose, rectPts(CELL, len)))
      // blueprint section hatching: tight one way for brick, wider the other way for wood
      hatch(pen, pose, CELL, len, kind === 'wall-brick' ? 4 : 7, kind === 'wall-brick' ? 1 : -1)
    },
    build({ world }, p) {
      const b = staticBox(world, pos(p), v(CELL, setting(p, LENGTH) * CELL), angleOf(p), {
        friction,
        restitution,
        data: { part: p.id, tags: ['wall'] },
      })
      return instance(p, [b])
    },
  }
}

export const WALLS: PartDef[] = [
  wall('wall-brick', 'Mur de briques', 0.6, 0.05),
  wall('wall-wood', 'Mur en bois', 0.4, 0.15),
]
