import { setVelocity, staticBox, velocity } from '../../engine/bodies'
import { add, dot, rotate, scale, sub, v } from '../../engine/vec'
import { MAX_SPEED } from '../../engine/world'
import { CELL, angleOf, instance, pos, setting } from '../common'
import { applyGlow, poseOf, rectPts, toWorld } from '../drawing'
import type { PartDef, SettingDef } from '../types'

const FORCE: SettingDef = { key: 'force', label: 'Force', min: 1, max: 5, step: 1, def: 3 }
/** Launch speed (units/s) along the pad normal: BASE + PER × force. */
const BASE = 200
const PER = 150

/** Launch speed for a force setting. */
export const launchSpeed = (force: number): number => BASE + PER * force

/**
 * Static spring pad (2 × 1), launching along its local up (−y) axis. When a dynamic body starts
 * touching it from the pad side, the body's velocity component along the pad normal is set to
 * `200 + 150 × force` (the tangential part is kept), then the whole velocity is clamped to
 * MAX_SPEED. `state.launches` counts launches.
 */
export const spring: PartDef = {
  kind: 'spring',
  label: 'Ressort',
  size: { w: 2, h: 1 },
  rotStep: 3,
  flippable: false,
  settings: [FORCE],
  anchors: [],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const pose = poseOf(s)
    const W = (pts: { x: number; y: number }[]) => toWorld(pose, pts)
    pen.poly(W(rectPts(2 * CELL, 4).map((q) => add(q, v(0, 8)))))
    pen.poly(W(rectPts(2 * CELL, 4).map((q) => add(q, v(0, -8)))))
    for (const x of [-12, 12]) {
      pen.path(W([v(x, 6), v(x - 5, 3), v(x + 5, 0), v(x - 5, -3), v(x, -6)]))
    }
  },
  build({ world }, p) {
    const pad = staticBox(world, pos(p), v(2 * CELL, CELL), angleOf(p), {
      friction: 0.5,
      data: { part: p.id, tags: ['spring'] },
    })
    const inst = instance(p, [pad])
    const up = rotate(v(0, -1), angleOf(p))
    const speed = launchSpeed(setting(p, FORCE))
    inst.state.launches = 0
    inst.onContact = (ev, self, other, sim) => {
      if (!ev.began || self !== pad || !other.isDynamic()) return
      // ev.normal points from a to b: make it point from the pad to the other body.
      const n = ev.a === pad ? ev.normal : scale(ev.normal, -1)
      if (dot(n, up) < 0.5) return
      const vel = velocity(other)
      let out = add(sub(vel, scale(up, dot(vel, up))), scale(up, speed))
      const s2 = dot(out, out)
      if (s2 > MAX_SPEED * MAX_SPEED) out = scale(out, MAX_SPEED / Math.sqrt(s2))
      setVelocity(other, out)
      inst.state.launches++
      sim.activate(inst)
    }
    return inst
  },
}
