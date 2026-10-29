import { dynamicCircle } from '../../engine/bodies'
import { pin } from '../../engine/joints'
import { v } from '../../engine/vec'
import { CELL, DENSITY, instance, pos } from '../common'
import { applyGlow, poseOf, toWorld } from '../drawing'
import type { PartDef } from '../types'
import { TURNING } from './gear'

const R = CELL

/** Wheel pinned to the ground at its centre, with a belt anchor. */
export const pulley: PartDef = {
  kind: 'pulley',
  label: 'Poulie',
  size: { w: 2, h: 2 },
  rotStep: 0,
  flippable: false,
  settings: [],
  anchors: [{ key: 'belt', local: v(0, 0), role: 'belt', radius: R }],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const pose = poseOf(s)
    pen.circle(pose, R)
    pen.circle(pose, R - 4)
    pen.circle(pose, 3)
    for (const [a, b] of [[v(-R + 4, 0), v(R - 4, 0)], [v(0, -R + 4), v(0, R - 4)]]) {
      const [p, q] = toWorld(pose, [a, b])
      pen.line(p, q)
    }
  },
  build({ world }, p) {
    const b = dynamicCircle(world, pos(p), R, {
      density: DENSITY,
      friction: 0.6,
      bullet: false,
      data: { part: p.id, tags: ['pulley'] },
    })
    const j = pin(world, b, pos(p))
    const inst = instance(p, [b], { belt: { body: b, local: v(0, 0), radius: R, pin: j } })
    inst.onStep = (sim) => {
      if (Math.abs(b.getAngularVelocity()) > TURNING) sim.activate(inst)
    }
    return inst
  },
}
