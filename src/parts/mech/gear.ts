import { dynamicCircle } from '../../engine/bodies'
import { gear, pin } from '../../engine/joints'
import { v } from '../../engine/vec'
import { bodyPose } from '../../engine/world'
import type { PartKind } from '../../level/types'
import { CELL, DENSITY, instance, pos } from '../common'
import { applyGlow, poseOf } from '../drawing'
import type { PartDef, PartInstance, SimCtx } from '../types'

/** Teeth stick out this far past the pitch radius; the collision circle stops this far inside it. */
const TOOTH = 2
/** Angular speed (rad/s) above which a wheel counts as turning (glows). */
export const TURNING = 0.5

/** Teeth outline around a pitch circle, for drawing (same tooth pitch for every gear so they interlock). */
function teeth(c: { x: number; y: number }, angle: number, r: number): { x: number; y: number }[] {
  const n = Math.round(r / 2)
  const pts = []
  for (let k = 0; k < 2 * n; k++) {
    const a = angle + (k * Math.PI) / n
    const rr = k % 2 === 0 ? r + TOOTH : r - TOOTH
    pts.push(v(c.x + rr * Math.cos(a), c.y + rr * Math.sin(a)))
  }
  return pts
}

function gearDef(kind: PartKind, label: string, cells: number): PartDef {
  const r = cells * CELL / 2
  return {
    kind,
    label,
    size: { w: cells, h: cells },
    rotStep: 0,
    flippable: false,
    settings: [],
    anchors: [{ key: 'belt', local: v(0, 0), role: 'belt' }],
    draw(pen, s) {
      pen.reset()
      applyGlow(pen, s)
      const pose = poseOf(s)
      pen.poly(teeth(pose, pose.angle, r))
      pen.circle(pose, 4)
      pen.line(v(pose.x, pose.y), v(pose.x + (r - 6) * Math.cos(pose.angle), pose.y + (r - 6) * Math.sin(pose.angle)))
    },
    build({ world }, p) {
      const b = dynamicCircle(world, pos(p), r - TOOTH, {
        density: DENSITY,
        friction: 0.6,
        bullet: false,
        data: { part: p.id, tags: ['gear'] },
      })
      const j = pin(world, b, pos(p))
      const inst = instance(p, [b], { belt: { body: b, local: v(0, 0), radius: r, pin: j } })
      inst.onStep = (sim) => {
        if (Math.abs(b.getAngularVelocity()) > TURNING) sim.activate(inst)
      }
      return inst
    },
  }
}

export const GEARS: PartDef[] = [gearDef('gear-small', 'Petit engrenage', 2), gearDef('gear-large', 'Grand engrenage', 4)]

const isGear = (p: PartInstance): boolean => p.kind === 'gear-small' || p.kind === 'gear-large'

/** Pitch radius (units) of a gear kind, undefined for any other part. */
export function gearRadius(kind: PartKind): number | undefined {
  if (kind === 'gear-small') return CELL
  if (kind === 'gear-large') return 2 * CELL
  return undefined
}

/** Two gears mesh when their centres are r1 + r2 apart (±1 unit). */
export function gearsMesh(a: { x: number; y: number; r: number }, b: { x: number; y: number; r: number }): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.abs(Math.sqrt(dx * dx + dy * dy) - (a.r + b.r)) <= 1
}

/**
 * Meshes every pair of gears whose centres are r1 + r2 apart (±1 unit), in placement order:
 * B turns -r1/r2 times as fast as A.
 */
export function meshGears(sim: SimCtx): void {
  const gears = sim.parts.filter(isGear)
  for (let i = 0; i < gears.length; i++) {
    for (let j = i + 1; j < gears.length; j++) {
      const a = gears[i].anchors.belt
      const b = gears[j].anchors.belt
      const pa = bodyPose(a.body)
      const pb = bodyPose(b.body)
      if (gearsMesh({ x: pa.x, y: pa.y, r: a.radius }, { x: pb.x, y: pb.y, r: b.radius })) gear(sim.world, a.pin!, b.pin!, -a.radius / b.radius)
    }
  }
}
