import { dynamicBox } from '../../engine/bodies'
import { v } from '../../engine/vec'
import { CELL, angleOf, instance, pos, setting } from '../common'
import { applyGlow, poseOf, rectPts, toWorld } from '../drawing'
import type { PartDef, SettingDef } from '../types'

const LENGTH: SettingDef = { key: 'length', label: 'Longueur', min: 2, max: 8, step: 1, def: 4 }
/** Thickness in units: a little under a cell, so a bar laid between two planks rests without being pinched. */
const THICK = 16

/**
 * Loose steel bar, length × 1 cells lying flat at rot 0 (16 units thick), tagged `metal` so magnets pull it. Low
 * friction: it slides out from between two planks when a magnet pulls it.
 */
export const metalBar: PartDef = {
  kind: 'metal-bar',
  label: 'Barre métallique',
  size: { w: LENGTH.def, h: 1 },
  sizeOf: (p) => ({ w: setting(p, LENGTH), h: 1 }),
  rotStep: 6,
  flippable: false,
  settings: [LENGTH],
  anchors: [],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const len = setting(s.placement, LENGTH) * CELL
    const pose = poseOf(s)
    pen.poly(toWorld(pose, rectPts(len, THICK)))
    // Sheen strokes so it reads as polished metal, not wood or brick.
    const width = pen.ctx.lineWidth
    pen.ctx.lineWidth = 0.8
    const n = Math.max(2, Math.round(len / 25))
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + (len * (i + 0.5)) / n
      const [a, b] = toWorld(pose, [v(x - 3, -THICK / 2 + 3), v(x + 3, THICK / 2 - 3)])
      pen.line(a, b)
    }
    pen.ctx.lineWidth = width
  },
  build({ world }, p) {
    const b = dynamicBox(world, pos(p), v(setting(p, LENGTH) * CELL, THICK), angleOf(p), {
      density: 2,
      friction: 0.2,
      restitution: 0.05,
      data: { part: p.id, tags: ['metal-bar', 'metal'] },
    })
    return instance(p, [b])
  },
}
