import { describe, expect, it } from 'vitest'
import { hashWorld } from '../../src/engine/hash'
import { rope } from '../../src/engine/joints'
import { v } from '../../src/engine/vec'
import { toM, toU } from '../../src/engine/world'
import { Simulation } from '../../src/game/simulation'
import type { Level, Link, PartKind, Placement, Solution } from '../../src/level/types'
import { partDef } from '../../src/parts/registry'

const P = (id: string, kind: PartKind, x: number, y: number, o: Partial<Placement> = {}): Placement => ({
  id, kind, x, y, rot: 0, flip: false, settings: {}, ...o,
})

const L = (id: string, kind: Link['kind'], a: [string, string], b: [string, string]): Link => ({
  id, kind, a: { part: a[0], anchor: a[1] }, b: { part: b[0], anchor: b[1] },
})

const level = (fixed: Placement[], fixedLinks: Link[] = []): Level => ({
  v: 1, id: 't', title: 't', fixed, fixedLinks, inventory: [], goals: [],
})
const empty: Solution = { placements: [], links: [] }

const run = (s: Simulation, n: number) => {
  for (let i = 0; i < n; i++) s.step()
}
const part = (s: Simulation, id: string) => s.parts.find((p) => p.id === id)!
const yOf = (s: Simulation, id: string) => toU(part(s, id).bodies[0].getPosition().y)

describe('power parts', () => {
  it('registers the power parts with their sizes, settings and anchors', () => {
    expect(partDef('mouse-cage').size).toEqual({ w: 3, h: 3 })
    expect(partDef('mouse-cage').settings).toEqual([expect.objectContaining({ key: 'start', min: 0, max: 1, def: 0 })])
    expect(partDef('mouse-cage').anchors).toEqual([expect.objectContaining({ key: 'belt', role: 'belt' })])
    expect(partDef('monkey-bike').size).toEqual({ w: 3, h: 2 })
    expect(partDef('monkey-bike').anchors).toEqual([expect.objectContaining({ key: 'belt', role: 'belt' })])
    expect(partDef('candle').size).toEqual({ w: 1, h: 1 })
    expect(partDef('candle').settings).toEqual([expect.objectContaining({ key: 'lit', min: 0, max: 1, def: 1 })])
    expect(partDef('balloon').size).toEqual({ w: 2, h: 3 })
    expect(partDef('balloon').anchors).toEqual([expect.objectContaining({ key: 'basket', role: 'rope' })])
  })

  it('the cage stays idle until a ball hits it, then its belted pulley turns', () => {
    const lv = level(
      [P('cage', 'mouse-cage', 400, 400), P('wheel', 'pulley', 550, 400), P('ball', 'ball-base', 400, 300)],
      [L('b', 'belt', ['cage', 'belt'], ['wheel', 'belt'])],
    )
    const s = new Simulation(lv, empty)
    const cage = part(s, 'cage')
    const wheel = part(s, 'wheel').bodies[0]
    run(s, 10)
    expect(cage.state.running).toBe(0)
    expect(Math.abs(wheel.getAngularVelocity())).toBeLessThan(0.01)
    run(s, 110)
    expect(cage.state.running).toBe(1)
    expect(cage.glow).toBeGreaterThan(0)
    expect(wheel.getAngularVelocity()).toBeCloseTo(6, 1)
  })

  it('a ball resting on the cage does not start it; start = 1 runs it at once', () => {
    const idle = new Simulation(level([P('cage', 'mouse-cage', 400, 400), P('ball', 'ball-base', 400, 361)]), empty)
    run(idle, 240)
    expect(part(idle, 'cage').state.running).toBe(0)
    const now = new Simulation(level([P('cage', 'mouse-cage', 400, 400, { settings: { start: 1 } })]), empty)
    run(now, 30)
    expect(part(now, 'cage').state.running).toBe(1)
    expect(part(now, 'cage').bodies[1].getAngularVelocity()).toBeCloseTo(6, 1)
  })

  it('flip reverses the motor: a flipped cage drives its belted pulley at -6 rad/s', () => {
    const go = (flip: boolean) => {
      const s = new Simulation(
        level(
          [P('cage', 'mouse-cage', 200, 300, { flip, settings: { start: 1 } }), P('wheel', 'pulley', 300, 300)],
          [L('b', 'belt', ['cage', 'belt'], ['wheel', 'belt'])],
        ),
        empty,
      )
      run(s, 60)
      return part(s, 'wheel').bodies[0].getAngularVelocity()
    }
    expect(go(false)).toBeCloseTo(6, 1)
    expect(go(true)).toBeCloseTo(-6, 1)
  })

  /**
   * Motor at (300, 300) belted to a pulley at (500, 300). A rope runs from the pulley rim (local
   * -20, 0) down to a bucket resting on a floor: turning clockwise lifts the bucket up to ~20 units.
   */
  function lift(motor: Placement, bowling: boolean): { lift: number; sim: Simulation } {
    const fixed = [
      motor,
      P('wheel', 'pulley', 500, 300),
      P('floor', 'wall-brick', 480, 450, { rot: 6, settings: { length: 10 } }),
      P('bucket', 'bucket', 480, 420),
    ]
    if (bowling) fixed.push(P('heavy', 'ball-bowling', 480, 419))
    if (motor.kind === 'monkey-bike') fixed.push(P('kick', 'ball-base', 300, 220))
    const s = new Simulation(level(fixed, [L('b', 'belt', ['m', 'belt'], ['wheel', 'belt'])]), empty)
    const bucket = part(s, 'bucket').bodies[0]
    s.ropes.push(rope(s.world, part(s, 'wheel').bodies[0], v(-20, 0), bucket, v(0, -20), 102))
    const y0 = yOf(s, 'bucket')
    let minY = y0
    for (let i = 0; i < 180; i++) {
      s.step()
      minY = Math.min(minY, yOf(s, 'bucket'))
    }
    expect(part(s, 'm').state.running).toBe(1)
    return { lift: y0 - minY, sim: s }
  }

  it('the mouse lifts an empty bucket but not one holding a bowling ball', () => {
    const cage = P('m', 'mouse-cage', 300, 300, { settings: { start: 1 } })
    expect(lift(cage, false).lift).toBeGreaterThan(10)
    expect(lift(cage, true).lift).toBeLessThan(3)
  })

  it('the monkey turns slower than the mouse but lifts the bucket holding a bowling ball', () => {
    const { lift: l, sim } = lift(P('m', 'monkey-bike', 300, 300), true)
    expect(l).toBeGreaterThan(10)
    const s = new Simulation(
      level(
        [
          P('cage', 'mouse-cage', 200, 300, { settings: { start: 1 } }), P('pa', 'pulley', 300, 300),
          P('bike', 'monkey-bike', 200, 500), P('pb', 'pulley', 300, 500), P('kick', 'ball-base', 200, 420),
        ],
        [L('a', 'belt', ['cage', 'belt'], ['pa', 'belt']), L('b', 'belt', ['bike', 'belt'], ['pb', 'belt'])],
      ),
      empty,
    )
    run(s, 120)
    expect(part(s, 'bike').state.running).toBe(1)
    expect(part(s, 'pa').bodies[0].getAngularVelocity()).toBeCloseTo(6, 1)
    expect(part(s, 'pb').bodies[0].getAngularVelocity()).toBeCloseTo(3, 1)
    expect(part(sim, 'm').glow).toBeGreaterThan(0)
  })

  it('a balloon over a lit candle rises and emits balloon-ceiling', () => {
    const s = new Simulation(level([P('balloon', 'balloon', 400, 60), P('candle', 'candle', 400, 100)]), empty)
    const y0 = yOf(s, 'balloon')
    run(s, 120)
    expect(y0 - yOf(s, 'balloon')).toBeGreaterThan(25)
    expect(s.events).toEqual([expect.objectContaining({ name: 'balloon-ceiling', part: 'balloon' })])
  })

  it('a balloon heated by a candle near the floor floats all the way up and emits balloon-ceiling', () => {
    const s = new Simulation(level([P('balloon', 'balloon', 400, 700), P('candle', 'candle', 400, 740)]), empty)
    run(s, 29)
    expect(part(s, 'balloon').state.heated).toBe(0)
    run(s, 2)
    expect(part(s, 'balloon').state.heated).toBe(1)
    expect(part(s, 'balloon').glow).toBeGreaterThan(0)
    run(s, 400)
    expect(yOf(s, 'balloon')).toBeLessThan(60)
    expect(s.events).toEqual([expect.objectContaining({ name: 'balloon-ceiling', part: 'balloon' })])
  })

  it('a balloon passing over a lit candle for under 30 steps does not heat', () => {
    const s = new Simulation(level([P('balloon', 'balloon', 370, 400), P('candle', 'candle', 400, 440)]), empty)
    part(s, 'balloon').bodies[0].setLinearVelocity({ x: toM(300), y: 0 })
    run(s, 120)
    expect(part(s, 'balloon').state.heated).toBe(0)
    expect(yOf(s, 'balloon')).toBeGreaterThan(400)
    expect(s.events).toEqual([])
  })

  it('the same balloon over an unlit candle stays put', () => {
    const s = new Simulation(
      level([P('balloon', 'balloon', 400, 60), P('candle', 'candle', 400, 100, { settings: { lit: 0 } })]),
      empty,
    )
    let minY = yOf(s, 'balloon')
    for (let i = 0; i < 240; i++) {
      s.step()
      minY = Math.min(minY, yOf(s, 'balloon'))
    }
    expect(minY).toBeGreaterThan(59)
    expect(yOf(s, 'balloon')).toBeLessThan(75)
    expect(s.events).toEqual([])
  })

  it('a lit candle cuts a rope passing over its flame after 60 steps', () => {
    const lv = (lit: number) =>
      level(
        [P('saw', 'seesaw', 400, 300), P('bucket', 'bucket', 460, 420), P('candle', 'candle', 466, 360, { settings: { lit } })],
        [L('rope', 'rope', ['saw', 'right'], ['bucket', 'handle'])],
      )
    const s = new Simulation(lv(1), empty)
    run(s, 50)
    expect(s.ropes[0].enabled).toBe(true)
    expect(part(s, 'candle').glow).toBeGreaterThan(0)
    run(s, 20)
    expect(s.ropes[0].enabled).toBe(false)
    expect(s.events).toEqual([expect.objectContaining({ name: 'rope-cut', part: 'candle' })])
    run(s, 60)
    expect(yOf(s, 'bucket')).toBeGreaterThan(500)

    const off = new Simulation(lv(0), empty)
    run(off, 240)
    expect(off.ropes[0].enabled).toBe(true)
    expect(off.events).toEqual([])
  })

  it('the balloon basket takes a rope', () => {
    const s = new Simulation(
      level([P('balloon', 'balloon', 400, 300), P('ball', 'ball-tennis', 400, 400)], [L('r', 'rope', ['balloon', 'basket'], ['ball', 'center'])]),
      empty,
    )
    expect(s.ropes).toHaveLength(1)
    const [a] = s.ropes[0].segment()
    expect(a.y).toBeCloseTo(330, 0)
  })

  it('relaunch gives equal hash, events and part state (cage, monkey, candle, balloon)', () => {
    const lv = level(
      [
        P('cage', 'mouse-cage', 200, 300), P('drop', 'ball-base', 200, 200), P('pa', 'pulley', 300, 300),
        P('bike', 'monkey-bike', 200, 500), P('kick', 'ball-base', 200, 420), P('pb', 'pulley', 300, 500),
        P('saw', 'seesaw', 600, 300), P('bucket', 'bucket', 660, 420), P('candle', 'candle', 666, 360),
        P('balloon', 'balloon', 900, 60), P('heat', 'candle', 900, 100),
      ],
      [
        L('a', 'belt', ['cage', 'belt'], ['pa', 'belt']), L('b', 'belt', ['bike', 'belt'], ['pb', 'belt']),
        L('rope', 'rope', ['saw', 'right'], ['bucket', 'handle']),
      ],
    )
    const before = JSON.parse(JSON.stringify(lv))
    const go = () => {
      const s = new Simulation(lv, empty)
      run(s, 300)
      return { hash: hashWorld(s.world), events: s.events, state: Object.fromEntries(s.parts.map((p) => [p.id, { ...p.state }])) }
    }
    const first = go()
    expect(first.events.map((e) => e.name).sort()).toEqual(['balloon-ceiling', 'rope-cut'])
    expect(first.state.cage.running).toBe(1)
    expect(first.state.bike.running).toBe(1)
    expect(go()).toEqual(first)
    expect(lv).toEqual(before)
  })

  it('the sandbox inventory offers the power parts', async () => {
    const sandbox = (await import('../../levels/00-sandbox.json')).default as Level
    const kinds = sandbox.inventory.map((i) => i.kind)
    for (const k of ['mouse-cage', 'monkey-bike', 'candle', 'balloon'] as PartKind[]) expect(kinds).toContain(k)
  })
})
