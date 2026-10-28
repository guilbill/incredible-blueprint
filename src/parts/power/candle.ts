import { staticBox } from '../../engine/bodies'
import { type Vec, add, pointSegmentDistance, v } from '../../engine/vec'
import { bodyPose } from '../../engine/world'
import { COLORS } from '../../render/pen'
import { instance, pos, setting } from '../common'
import { applyGlow, rectPts, toWorld } from '../drawing'
import type { PartDef, PartInstance, SettingDef } from '../types'

const LIT: SettingDef = { key: 'lit', label: 'Allumée', min: 0, max: 1, step: 1, def: 1 }
/** Flame point, placement-local (the wax spans y -2..10). */
const FLAME = v(0, -6)
/** A rope within this distance (units) of the flame burns. */
const REACH = 10
/** Consecutive steps a rope must burn before it is cut. */
const BURN_STEPS = 60

/** Wax body centre, placement-local. */
const WAX = v(0, 4)

/** World position of a candle's flame (candles are static and never rotate). */
export const flameOf = (inst: PartInstance): Vec => {
  const p = bodyPose(inst.bodies[0])
  return v(p.x + FLAME.x - WAX.x, p.y + FLAME.y - WAX.y)
}

/**
 * Static candle. Lit, it cuts any enabled rope whose segment stays within 10 units of the flame
 * for 60 consecutive steps (counters `burn<i>` per rope index in state) and heats balloons.
 */
export const candle: PartDef = {
  kind: 'candle',
  label: 'Bougie',
  size: { w: 1, h: 1 },
  rotStep: 0,
  flippable: false,
  settings: [LIT],
  anchors: [],
  draw(pen, s) {
    pen.reset()
    applyGlow(pen, s)
    const c = { x: s.placement.x, y: s.placement.y, angle: 0 }
    pen.poly(toWorld(c, rectPts(8, 12).map((q) => add(q, WAX))))
    const [w0, w1] = toWorld(c, [v(0, -2), v(0, -4)])
    pen.line(w0, w1)
    if ((s.inst?.state.lit ?? setting(s.placement, LIT)) !== 1) return
    pen.reset(COLORS.yellow)
    pen.glow(0.6, 'yellow')
    const [a, b, t] = toWorld(c, [v(-3, -5), v(3, -5), v(0, -13)])
    pen.poly([a, t, b, toWorld(c, [v(0, -3)])[0]])
  },
  build({ world }, p) {
    const body = staticBox(world, add(pos(p), WAX), v(8, 12), 0, {
      friction: 0.5,
      data: { part: p.id, tags: ['candle'] },
    })
    const inst = instance(p, [body])
    inst.state.lit = setting(p, LIT)
    const flame = add(pos(p), FLAME)
    inst.onStep = (sim) => {
      if (!inst.state.lit) return
      sim.ropes.forEach((r, i) => {
        const key = `burn${i}`
        if (!r.enabled || pointSegmentDistance(flame, ...r.segment()) > REACH) {
          if (inst.state[key]) inst.state[key] = 0
          return
        }
        inst.state[key] = (inst.state[key] ?? 0) + 1
        sim.activate(inst)
        if (inst.state[key] < BURN_STEPS) return
        inst.state[key] = 0
        r.cut()
        sim.emit('rope-cut', inst.id)
      })
    }
    return inst
  },
}
