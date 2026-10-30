import { dynamicBox, staticBox } from '../../engine/bodies'
import { pin } from '../../engine/joints'
import { type Vec, add, len, rotate, scale, segmentsIntersect, sub, v } from '../../engine/vec'
import { CELL, DENSITY, angleOf, instance, pos } from '../common'
import { applyGlow, toWorld } from '../drawing'
import type { PartDef } from '../types'
import type { Placement } from '../../level/types'

const HALF = CELL
const PIVOT = v(4, 0)
/** The cutting line, from the blade tips to the pivot. A rope crossing it is cut when the scissors close. */
const BLADE: [Vec, Vec] = [v(-HALF, 0), PIVOT]
const HANDLE_AT = v(12, 0)
const HANDLE = 14
/** Minimum contact impulse (kg·units/s) on the handle that closes the scissors. */
const TRIGGER = 40

/** Placement-local point (flip then rotation) to world. */
function at(p: Placement, local: Vec): Vec {
  return add(pos(p), rotate(v(p.flip ? -local.x : local.x, local.y), angleOf(p)))
}

/** Blade outline with its cutting edge on tip → pivot; side -1 is the upper blade, 1 the lower. */
function bladePts(gap: number, side: number, back: number): Vec[] {
  const tip = v(-HALF, side * gap)
  const d = sub(PIVOT, tip)
  const a = scale(d, 1 / len(d))
  const n = v(-side * a.y, side * a.x)
  return [tip, PIVOT, add(sub(PIVOT, scale(a, 6)), scale(n, back)), add(add(tip, scale(a, 9)), scale(n, back * 0.7))]
}

/** Finger ring centre for a blade side: the ring sits on the other side (the blades cross at the pivot). */
const ringAt = (gap: number, side: number): Vec => v(14.5, -side * (4.5 + ((gap - 1) * 2.5) / 7))

/**
 * Open scissors on a static frame, with a dynamic handle held in place. A hit on the handle with
 * impulse > 40 closes them (state `closed` = 1) and cuts every enabled rope crossing the blades.
 */
export const scissors: PartDef = {
  kind: 'scissors',
  label: 'Ciseaux',
  size: { w: 2, h: 2 },
  rotStep: 6,
  flippable: true,
  settings: [],
  anchors: [],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const p = s.placement
    const pose = { x: p.x, y: p.y, angle: angleOf(p) }
    const sx = p.flip ? -1 : 1
    const W = (pts: Vec[]) => toWorld(pose, pts.map((q) => v(q.x * sx, q.y)))
    const gap = s.inst?.state.closed ? 1 : 8
    // Two slim blades crossing at the pivot screw, each with its finger ring on the other side.
    const R = 4
    for (const side of [-1, 1]) {
      pen.poly(W(bladePts(gap, side, 3.2)))
      const ring = ringAt(gap, side)
      const d = sub(ring, PIVOT)
      const [a, b, r] = W([PIVOT, sub(ring, scale(d, R / len(d))), ring])
      pen.line(a, b)
      pen.circle(r, R)
    }
    pen.circle(W([PIVOT])[0], 1.8)
  },
  build({ world }, p) {
    const angle = angleOf(p)
    const frame = staticBox(world, at(p, PIVOT), v(6, 6), angle, {
      sensor: true,
      data: { part: p.id, tags: ['scissors'] },
    })
    const handleAt = at(p, HANDLE_AT)
    const handle = dynamicBox(world, handleAt, v(HANDLE, HANDLE), angle, {
      // Heavy, so the pin barely gives and a hit reads close to a hit on a wall.
      density: 5 * DENSITY,
      friction: 0.4,
      data: { part: p.id, tags: ['scissors-handle', 'metal'] },
    })
    const j = pin(world, handle, handleAt)
    j.setLimits(0, 0)
    j.enableLimit(true)
    const blade: [Vec, Vec] = [at(p, BLADE[0]), at(p, BLADE[1])]
    const inst = instance(p, [frame, handle])
    inst.state.closed = 0
    inst.onContact = (ev, self, _other, sim) => {
      if (self !== handle || ev.began || ev.impulse <= TRIGGER || inst.state.closed) return
      inst.state.closed = 1
      sim.activate(inst)
      for (const r of sim.ropes) {
        if (!r.enabled) continue
        const [a, b] = r.segment()
        if (!segmentsIntersect(blade[0], blade[1], a, b)) continue
        r.cut()
        sim.emit('rope-cut', inst.id)
      }
    }
    return inst
  },
}
