import { compound } from '../../engine/bodies'
import { v } from '../../engine/vec'
import { CELL, DENSITY, instance, pos } from '../common'
import type { AnchorDef, PartDef } from '../types'
import { applyGlow, poseOf, toWorld } from '../drawing'

const W = 2 * CELL
const H = 2 * CELL
/** Thin sides so a bowling ball (r 14) still fits; balls are bullets, so no tunnelling. */
const T = 5
const HANDLE: AnchorDef = { key: 'handle', local: v(0, -H / 2), role: 'rope' }

/** Dynamic U shape (bottom and two sides), open at the top, with a rope handle at the rim centre. */
export const bucket: PartDef = {
  kind: 'bucket',
  label: 'Seau',
  size: { w: 2, h: 2 },
  rotStep: 0,
  flippable: false,
  settings: [],
  anchors: [HANDLE],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const pose = poseOf(s)
    const hw = W / 2
    const hh = H / 2
    pen.path(toWorld(pose, [v(-hw, -hh), v(-hw, hh), v(hw, hh), v(hw, -hh)]))
    pen.path(toWorld(pose, [v(-hw + T, -hh), v(-hw + T, hh - T), v(hw - T, hh - T), v(hw - T, -hh)]))
    pen.circle(toWorld(pose, [HANDLE.local])[0], 3)
  },
  build({ world }, p) {
    const b = compound(
      world,
      pos(p),
      [
        { kind: 'box', wh: v(W, T), offset: v(0, H / 2 - T / 2) },
        { kind: 'box', wh: v(T, H - T), offset: v(-W / 2 + T / 2, -T / 2) },
        { kind: 'box', wh: v(T, H - T), offset: v(W / 2 - T / 2, -T / 2) },
      ],
      { density: DENSITY, friction: 0.5, restitution: 0.1, data: { part: p.id, tags: ['bucket'] } },
    )
    return instance(p, [b], { handle: { body: b, local: HANDLE.local, radius: 0 } })
  },
}
