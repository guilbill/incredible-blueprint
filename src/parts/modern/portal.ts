import type { Body } from 'planck'
import { centreOf, staticBox, teleport, velocity } from '../../engine/bodies'
import { type Vec, add, dot, rotate, scale, segmentsIntersect, sub, v } from '../../engine/vec'
import { bodyPose } from '../../engine/world'
import { COLORS } from '../../render/pen'
import { CELL, ROT_ANGLE, angleOf, instance, pos, setting } from '../common'
import { applyGlow, poseOf, toWorld } from '../drawing'
import type { PartDef, PartInstance, SettingDef } from '../types'

const CHANNEL: SettingDef = { key: 'channel', label: 'Canal', min: 1, max: 3, step: 1, def: 1 }
/** Half length of the mouth (the portal's local y extent), in units. */
const MOUTH = CELL
/** Distance (units) in front of the exit mouth where a teleported body's centre lands. */
const EXIT = CELL / 2
/** Steps during which a teleported body ignores every portal. */
const COOLDOWN = 30

/** Step until which each body ignores portals. Keyed by body, so each Simulation has its own entries. */
const cooldown = new WeakMap<Body, number>()

/** The portal paired with `inst`: the first other portal on the same channel, in creation order. */
export function partnerOf(inst: PartInstance, parts: PartInstance[]): PartInstance | undefined {
  return parts.find((q) => q !== inst && q.kind === 'portal' && q.state.channel === inst.state.channel)
}

/**
 * Static portal (1 × 2), a sensor: things pass through it. Its mouth is the segment along its local
 * y axis through the centre, facing local +x. A dynamic body whose centre crosses the mouth from
 * the front comes out of the partner portal (first other portal on the same `channel`), EXIT units
 * in front of its mouth, with its velocity rotated by (rotB − rotA + 12) × 15°, so what goes in
 * comes out facing away from the partner. Teleported bodies ignore portals for 30 steps. A portal
 * with no partner does nothing. `state.teleports` counts the bodies sent from this portal.
 */
export const portal: PartDef = {
  kind: 'portal',
  label: 'Portail',
  size: { w: 1, h: 2 },
  rotStep: 1,
  flippable: false,
  settings: [CHANNEL],
  anchors: [],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const pose = poseOf(s)
    const W = (pts: Vec[]) => toWorld(pose, pts)
    // oval ring, flattened toward the back
    const ring: Vec[] = []
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8
      ring.push(v(Math.cos(a) * 6, Math.sin(a) * MOUTH))
    }
    pen.poly(W(ring))
    const [b0, b1] = W([v(-CELL / 2, -MOUTH + 4), v(-CELL / 2, MOUTH - 4)])
    pen.line(b0, b1)
    pen.reset(COLORS.note)
    const ch = s.inst?.state.channel ?? setting(s.placement, CHANNEL)
    // channel number, upright, inside the ring
    pen.label(String(ch), v(pose.x - 2.5, pose.y + 3))
  },
  build({ world }, p) {
    const angle = angleOf(p)
    const b = staticBox(world, pos(p), v(CELL, 2 * CELL), angle, {
      sensor: true,
      data: { part: p.id, tags: ['portal'] },
    })
    const inst = instance(p, [b])
    inst.state.channel = setting(p, CHANNEL)
    inst.state.rot = p.rot
    inst.state.teleports = 0
    const mouth = pos(p)
    const normal = rotate(v(1, 0), angle)
    const ends: [Vec, Vec] = [add(mouth, rotate(v(0, -MOUTH), angle)), add(mouth, rotate(v(0, MOUTH), angle))]
    /** Each body's centre at the previous step, for crossing tests. */
    const prev = new Map<Body, Vec>()
    inst.onStep = (sim) => {
      const partner = partnerOf(inst, sim.parts)
      for (const o of sim.world.bodies()) {
        if (!o.isDynamic() || !o.isActive()) continue
        const c = centreOf(o)
        const was = prev.get(o)
        prev.set(o, c)
        if (!partner || !was || (cooldown.get(o) ?? -1) > sim.step) continue
        const relWas = sub(was, mouth)
        const rel = sub(c, mouth)
        if (dot(relWas, normal) <= 0 || dot(rel, normal) > 0 || !segmentsIntersect(was, c, ends[0], ends[1])) continue
        const turn = (partner.state.rot - inst.state.rot + 12) * ROT_ANGLE
        const outAngle = partner.state.rot * ROT_ANGLE
        const exit = bodyPose(partner.bodies[0])
        const outMouth = v(exit.x, exit.y)
        const side = sub(rel, scale(normal, dot(rel, normal)))
        const to = add(add(outMouth, rotate(side, turn)), rotate(v(EXIT, 0), outAngle))
        teleport(o, to, rotate(velocity(o), turn))
        prev.set(o, to)
        cooldown.set(o, sim.step + COOLDOWN)
        inst.state.teleports++
        sim.activate(inst)
        sim.activate(partner)
      }
    }
    return inst
  },
}
