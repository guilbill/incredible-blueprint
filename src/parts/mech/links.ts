import type { Joint } from 'planck'
import { gear, rope } from '../../engine/joints'
import { type Vec, add, len, rotate, sub, v } from '../../engine/vec'
import { bodyPose } from '../../engine/world'
import type { Anchor, Link, Placement } from '../../level/types'
import { partDef } from '../registry'
import type { AnchorDef, PartInstance, SimCtx } from '../types'

/** Rope slack (units) added to the distance between the two anchors when the rope is built. */
const SLACK = 2

export function anchorDef(a: Anchor, parts: Placement[]): AnchorDef | undefined {
  const p = parts.find((q) => q.id === a.part)
  return p && partDef(p.kind).anchors.find((d) => d.key === a.anchor)
}

/** Both anchors exist on two different parts and share a role (so belts only join belt anchors). */
export function canLink(a: Anchor, b: Anchor, parts: Placement[]): boolean {
  if (a.part === b.part) return false
  const da = anchorDef(a, parts)
  const db = anchorDef(b, parts)
  return !!da && !!db && da.role === db.role
}

const worldPoint = (anc: PartInstance['anchors'][string]): Vec => {
  const p = bodyPose(anc.body)
  return add(v(p.x, p.y), rotate(anc.local, p.angle))
}

/**
 * Builds a rope (added to sim.ropes, max length = current distance + 2) or a belt (B turns ra/rb
 * times as fast as A). Returns null, building nothing, when the link does not match two existing
 * anchors of its kind.
 */
export function buildLink(link: Link, sim: SimCtx): Joint | null {
  if (link.a.part === link.b.part) return null
  const ia = sim.part(link.a.part)
  const ib = sim.part(link.b.part)
  const a = ia?.anchors[link.a.anchor]
  const b = ib?.anchors[link.b.anchor]
  if (!ia || !ib || !a || !b) return null
  const role = (inst: PartInstance, key: string) => partDef(inst.kind).anchors.find((d) => d.key === key)?.role
  if (role(ia, link.a.anchor) !== link.kind || role(ib, link.b.anchor) !== link.kind) return null
  if (link.kind === 'belt') {
    if (!a.pin || !b.pin || a.radius <= 0 || b.radius <= 0) return null
    return gear(sim.world, a.pin, b.pin, a.radius / b.radius)
  }
  const r = rope(sim.world, a.body, a.local, b.body, b.local, len(sub(worldPoint(b), worldPoint(a))) + SLACK)
  sim.ropes.push(r)
  return r.joint
}
