import { describe, expect, it } from 'vitest'
import { hashWorld } from '../../src/engine/hash'
import { Simulation, runUntilGoal } from '../../src/game/simulation'
import type { Level, PartKind, Placement, Solution } from '../../src/level/types'

const P = (id: string, kind: PartKind, x: number, y: number, o: Partial<Placement> = {}): Placement => ({
  id, kind, x, y, rot: 0, flip: false, settings: {}, ...o,
})

const level: Level = {
  v: 1, id: 't', title: 't', goalText: 't',
  fixed: [P('floor', 'wall-brick', 300, 720, { rot: 6, settings: { length: 16 } }), P('ball', 'ball-base', 200, 100)],
  fixedLinks: [],
  inventory: [{ kind: 'ramp', count: 1 }],
  goals: [{ type: 'inZone', part: 'ball', zone: { x: 330, y: 500, w: 300, h: 190 } }],
}
const withRamp: Solution = { placements: [P('r1', 'ramp', 200, 200, { rot: 2 })], links: [] }
const empty: Solution = { placements: [], links: [] }

describe('simulation', () => {
  it('meets the goal with the ramp', () => {
    expect(runUntilGoal(level, withRamp).met).toBe(true)
  })
  it('fails without the ramp after 10 s', () => {
    const r = runUntilGoal(level, empty, 1200)
    expect(r.met).toBe(false)
    expect(r.step).toBe(1200)
  })
  it('relaunch gives the same run and leaves the level untouched', () => {
    const before = JSON.parse(JSON.stringify(level))
    const run = () => {
      const s = new Simulation(level, withRamp)
      for (let i = 0; i < 900; i++) s.step()
      return hashWorld(s.world)
    }
    expect(run()).toBe(run())
    expect(level).toEqual(before)
  })
  it('emit records the step and activate sets glow, which decays', () => {
    const s = new Simulation(level, empty)
    s.step()
    const part = s.parts.find((p) => p.id === 'ball')!
    part.onStep = (c) => { c.emit('cheese-eaten', part.id); c.activate(part) }
    s.step()
    expect(s.events).toEqual([{ name: 'cheese-eaten', part: 'ball', step: 1 }])
    expect(part.glow).toBeCloseTo(1 - 0.02)
  })
})

describe('goals', () => {
  it('treats a hold below 1 as 1: the part must actually be in the zone', () => {
    const away = { ...level, goals: [{ type: 'inZone' as const, part: 'ball', zone: { x: 0, y: 0, w: 10, h: 10 }, hold: 0 }] }
    const s = new Simulation(away, empty)
    s.step()
    expect(s.goalsMet).toBe(false)
    const inside = { ...level, goals: [{ type: 'inZone' as const, part: 'ball', zone: { x: 150, y: 50, w: 100, h: 100 }, hold: 0 }] }
    const t = new Simulation(inside, empty)
    t.step()
    expect(t.goalsMet).toBe(true)
  })
})
