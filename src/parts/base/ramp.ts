import { staticBox } from '../../engine/bodies'
import { v } from '../../engine/vec'
import { CELL, angleOf, instance, pos, setting } from '../common'
import type { PartDef, SettingDef } from '../types'
import { applyGlow, hatch, poseOf, rectPts, toWorld } from '../drawing'

const LENGTH: SettingDef = { key: 'length', label: 'Longueur', min: 2, max: 12, step: 1, def: 4 }
/** Plank thickness in units (walls and floors are at least 10 thick). */
const THICK = 10

export const ramp: PartDef = {
  kind: 'ramp',
  label: 'Planche inclinée',
  size: { w: LENGTH.def, h: 1 },
  sizeOf: (p) => ({ w: setting(p, LENGTH), h: 1 }),
  rotStep: 1,
  flippable: false,
  settings: [LENGTH],
  anchors: [],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const len = setting(s.placement, LENGTH) * CELL
    pen.poly(toWorld(poseOf(s), rectPts(len, THICK)))
    hatch(pen, poseOf(s), len, THICK, 5)
  },
  build({ world }, p) {
    const b = staticBox(world, pos(p), v(setting(p, LENGTH) * CELL, THICK), angleOf(p), {
      friction: 0.3,
      restitution: 0.1,
      data: { part: p.id, tags: ['ramp'] },
    })
    return instance(p, [b])
  },
}
