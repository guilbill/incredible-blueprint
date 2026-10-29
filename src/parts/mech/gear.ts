import { dynamicCircle } from '../../engine/bodies'
import { gear, pin } from '../../engine/joints'
import { type Vec, v } from '../../engine/vec'
import { bodyPose } from '../../engine/world'
import type { PartKind, Placement } from '../../level/types'
import { CELL, DENSITY, instance, pos } from '../common'
import { applyGlow, poseOf } from '../drawing'
import type { PartDef, PartInstance, SimCtx } from '../types'

/** Teeth stick out this far past the pitch radius; the collision circle stops this far inside it. */
const TOOTH = 2
/** Angular speed (rad/s) above which a wheel counts as turning (glows). */
export const TURNING = 0.5

/** Tooth height: the tips sit this far outside the pitch circle, the roots this far inside. */
const ADD = 3

/**
 * Closed outline of a gear: one trapezoid tooth per two units of radius (same pitch for every gear),
 * the first centred on `angle`, tips on r + 3 and roots on r - 3.
 */
export function gearOutline(c: Vec, angle: number, r: number): Vec[] {
  const n = Math.round(r / 2)
  const p = (2 * Math.PI) / n
  const rootHalf = 0.28 * p
  const tipHalf = 0.15 * p
  const at = (rr: number, a: number): Vec => v(c.x + rr * Math.cos(a), c.y + rr * Math.sin(a))
  const pts: Vec[] = []
  for (let k = 0; k < n; k++) {
    const a = angle + k * p
    for (let i = 0; i < 3; i++) pts.push(at(r + ADD, a - tipHalf + i * tipHalf))
    for (let i = 0; i < 3; i++) pts.push(at(r - ADD, a + rootHalf + (i * (p - 2 * rootHalf)) / 2))
  }
  return pts
}

/**
 * Drawing angle offset of every gear, so meshing teeth fall into each other's gaps. Each group of
 * meshing gears starts at phase 0 on its first gear in order; neighbours follow breadth first.
 */
export function gearPhases(placements: Placement[]): Map<string, number> {
  const gears = placements.filter((q) => gearRadius(q.kind) !== undefined)
  const rOf = (q: Placement): number => gearRadius(q.kind)!
  const phases = new Map<string, number>()
  for (const start of gears) {
    if (phases.has(start.id)) continue
    phases.set(start.id, 0)
    const queue = [start]
    for (let head = 0; head < queue.length; head++) {
      const a = queue[head]
      for (const b of gears) {
        if (phases.has(b.id)) continue
        if (!gearsMesh({ x: a.x, y: a.y, r: rOf(a) }, { x: b.x, y: b.y, r: rOf(b) })) continue
        const theta = Math.atan2(b.y - a.y, b.x - a.x)
        const nB = Math.round(rOf(b) / 2)
        phases.set(b.id, theta + Math.PI + Math.PI / nB - (rOf(a) / rOf(b)) * (phases.get(a.id)! - theta))
        queue.push(b)
      }
    }
  }
  return phases
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
    anchors: [{ key: 'belt', local: v(0, 0), role: 'belt', radius: r }],
    draw(pen, s) {
      pen.reset()
      applyGlow(pen, s)
      const pose = poseOf(s)
      const a = pose.angle + (s.phase ?? 0)
      const at = (rr: number, ang: number): Vec => v(pose.x + rr * Math.cos(ang), pose.y + rr * Math.sin(ang))
      pen.poly(gearOutline(pose, a, r))
      pen.circle(pose, 4)
      if (cells === 4) {
        pen.circle(pose, r - 8)
        pen.circle(pose, 8)
        // Four doubled spokes from the hub ring to the rim circle.
        for (let k = 0; k < 4; k++) {
          const ka = a + (k * Math.PI) / 2
          pen.line(at(8, ka - 0.25), at(r - 8, ka - 0.08))
          pen.line(at(8, ka + 0.25), at(r - 8, ka + 0.08))
        }
      } else {
        pen.circle(pose, r - 7)
      }
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

/** How far (units) the centre distance may stray from r1 + r2 and still count as meshing. */
export const MESH_TOL = 1

/** Two gears mesh when their centres are r1 + r2 apart (±MESH_TOL units). */
export function gearsMesh(a: { x: number; y: number; r: number }, b: { x: number; y: number; r: number }): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.abs(Math.sqrt(dx * dx + dy * dy) - (a.r + b.r)) <= MESH_TOL
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
