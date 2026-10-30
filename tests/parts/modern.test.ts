import { describe, expect, it } from 'vitest'
import { data, staticBox } from '../../src/engine/bodies'
import { hashWorld } from '../../src/engine/hash'
import { v } from '../../src/engine/vec'
import { MAX_SPEED, toM, toU } from '../../src/engine/world'
import { Simulation } from '../../src/game/simulation'
import type { Level, PartKind, Placement, Solution } from '../../src/level/types'
import { partDef } from '../../src/parts/registry'

const P = (id: string, kind: PartKind, x: number, y: number, o: Partial<Placement> = {}): Placement => ({
  id, kind, x, y, rot: 0, flip: false, settings: {}, ...o,
})

const level = (fixed: Placement[]): Level => ({
  v: 1, id: 't', title: 't', fixed, fixedLinks: [], inventory: [], goals: [],
})
const empty: Solution = { placements: [], links: [] }

const run = (s: Simulation, n: number) => {
  for (let i = 0; i < n; i++) s.step()
}
const part = (s: Simulation, id: string) => s.parts.find((p) => p.id === id)!
const body = (s: Simulation, id: string) => part(s, id).bodies[0]
const xOf = (s: Simulation, id: string) => toU(body(s, id).getPosition().x)
const yOf = (s: Simulation, id: string) => toU(body(s, id).getPosition().y)
const velOf = (s: Simulation, id: string) => {
  const lv = body(s, id).getLinearVelocity()
  return { x: toU(lv.x), y: toU(lv.y) }
}
const push = (s: Simulation, id: string, vel: { x: number; y: number }) =>
  body(s, id).setLinearVelocity({ x: toM(vel.x), y: toM(vel.y) })

/** Floor from x 140 to 460, top at y 490; walls 1 cell wide at both ends (inner faces x 150 and 450). */
const room = (): Placement[] => [
  P('floor', 'wall-brick', 300, 500, { rot: 6, settings: { length: 16 } }),
  P('left', 'wall-brick', 140, 450, { settings: { length: 4 } }),
  P('right', 'wall-brick', 460, 450, { settings: { length: 4 } }),
]

describe('modern parts', () => {
  it('registers the modern parts with their sizes and settings', () => {
    expect(partDef('magnet').size).toEqual({ w: 2, h: 1 })
    expect(partDef('magnet').settings).toEqual([expect.objectContaining({ key: 'power', min: 1, max: 5, def: 3 })])
    expect(partDef('portal').settings).toEqual([expect.objectContaining({ key: 'channel', min: 1, max: 3 })])
    expect(partDef('spring').size).toEqual({ w: 2, h: 1 })
    expect(partDef('spring').settings).toEqual([expect.objectContaining({ key: 'force', min: 1, max: 5, def: 3 })])
    expect(partDef('fan').size).toEqual({ w: 2, h: 2 })
    expect(partDef('fan').settings).toEqual([
      expect.objectContaining({ key: 'delay', min: 0, max: 20, def: 0 }),
      expect.objectContaining({ key: 'power', min: 1, max: 5 }),
    ])
  })

  it('tags the metal parts', () => {
    const s = new Simulation(
      level([
        P('bowling', 'ball-bowling', 100, 100), P('base', 'ball-base', 200, 100), P('tennis', 'ball-tennis', 300, 100),
        P('bucket', 'bucket', 400, 100), P('scissors', 'scissors', 600, 100), P('trap', 'mousetrap', 800, 100),
      ]),
      empty,
    )
    const metal = (id: string, n = 0) => data(part(s, id).bodies[n]).tags.includes('metal')
    expect(metal('bowling')).toBe(false)
    expect(metal('base')).toBe(true)
    expect(metal('bucket')).toBe(true)
    expect(metal('scissors', 1)).toBe(true)
    expect(metal('trap')).toBe(true)
    expect(metal('tennis')).toBe(false)
  })

  it('a magnet pulls a steel ball but not a bowling ball', () => {
    const s = new Simulation(
      level([...room(), P('magnet', 'magnet', 300, 480), P('steel', 'ball-base', 380, 482), P('bowling', 'ball-bowling', 220, 476)]),
      empty,
    )
    run(s, 30)
    expect(xOf(s, 'steel')).toBeLessThan(360)
    expect(xOf(s, 'bowling')).toBeCloseTo(220, 3)
    expect(part(s, 'magnet').glow).toBeGreaterThan(0)
  })

  it('a magnet leaves metal beyond 6 cells alone', () => {
    const s = new Simulation(level([...room(), P('magnet', 'magnet', 200, 480), P('steel', 'ball-base', 330, 482)]), empty)
    run(s, 30)
    expect(xOf(s, 'steel')).toBeCloseTo(330, 3)
    expect(part(s, 'magnet').glow).toBe(0)
  })

  it('a portal pair rotated 90° turns a horizontal velocity into a vertical one', () => {
    // A faces +x on the floor; B, turned 270°, faces up, high above the room.
    const s = new Simulation(
      level([...room(), P('a', 'portal', 200, 470), P('b', 'portal', 700, 300, { rot: 18 }), P('ball', 'ball-tennis', 300, 483)]),
      empty,
    )
    push(s, 'ball', v(-300, 0))
    let n = 0
    let before = 0
    while (part(s, 'a').state.teleports === 0 && n++ < 120) {
      before = velOf(s, 'ball').x
      s.step()
    }
    expect(before).toBeLessThan(-150)
    expect(part(s, 'a').state.teleports).toBe(1)
    expect(xOf(s, 'ball')).toBeGreaterThan(670)
    expect(xOf(s, 'ball')).toBeLessThan(730)
    expect(yOf(s, 'ball')).toBeLessThan(300)
    const vel = velOf(s, 'ball')
    expect(Math.abs(vel.x)).toBeLessThan(10)
    // Same speed, turned upward; the step after the teleport adds one step of gravity.
    expect(vel.y).toBeCloseTo(before + 900 / 120, 1)
    expect(part(s, 'a').glow).toBeGreaterThan(0)
    expect(part(s, 'b').glow).toBeGreaterThan(0)
    const out = yOf(s, 'ball')
    run(s, 20)
    expect(yOf(s, 'ball')).toBeLessThan(out - 15)
  })

  it('a portal pair with the same rotation sends the ball back out facing the other way', () => {
    const s = new Simulation(
      level([...room(), P('a', 'portal', 200, 470), P('b', 'portal', 700, 300), P('ball', 'ball-tennis', 300, 483)]),
      empty,
    )
    push(s, 'ball', v(-300, 0))
    run(s, 60)
    expect(part(s, 'a').state.teleports).toBe(1)
    expect(xOf(s, 'ball')).toBeGreaterThan(710)
    expect(velOf(s, 'ball').x).toBeGreaterThan(150)
  })

  it('a portal without a partner on its channel does nothing', () => {
    const s = new Simulation(
      level([...room(), P('a', 'portal', 200, 470), P('b', 'portal', 700, 300, { settings: { channel: 2 } }), P('ball', 'ball-tennis', 300, 483)]),
      empty,
    )
    push(s, 'ball', v(-300, 0))
    run(s, 60)
    expect(part(s, 'a').state.teleports).toBe(0)
    expect(xOf(s, 'ball')).toBeLessThan(200)
    expect(part(s, 'a').glow).toBe(0)
  })

  it('a spring at force 5 sends a ball higher than at force 1', () => {
    const top = (force: number): number => {
      const s = new Simulation(level([...room(), P('spring', 'spring', 300, 480, { settings: { force } }), P('ball', 'ball-base', 300, 400)]), empty)
      let best = Infinity
      for (let i = 0; i < 150; i++) {
        s.step()
        best = Math.min(best, yOf(s, 'ball'))
      }
      expect(part(s, 'spring').state.launches).toBeGreaterThan(0)
      return best
    }
    const weak = top(1)
    const strong = top(5)
    expect(strong).toBeLessThan(weak - 200)
  })

  it('a ball at max speed out of a spring does not cross a 10-unit wall (Review Focus 4)', () => {
    const s = new Simulation(level([P('spring', 'spring', 300, 600, { settings: { force: 5 } }), P('ball', 'ball-base', 280, 570)]), empty)
    // Thin ceiling, 10 units thick (y 395..405), across the ball's path.
    staticBox(s.world, v(400, 400), v(400, 10), 0, {})
    push(s, 'ball', v(500, 600))
    let fastest = 0
    let highest = Infinity
    for (let i = 0; i < 120; i++) {
      s.step()
      const vel = velOf(s, 'ball')
      fastest = Math.max(fastest, Math.sqrt(vel.x * vel.x + vel.y * vel.y))
      highest = Math.min(highest, yOf(s, 'ball'))
    }
    expect(part(s, 'spring').state.launches).toBeGreaterThan(0)
    expect(fastest).toBeGreaterThan(MAX_SPEED - 10)
    expect(fastest).toBeLessThanOrEqual(MAX_SPEED + 1e-6)
    expect(highest).toBeGreaterThan(405)
  })

  it('a fan with delay 4 does not push before step 240 and pushes after', () => {
    const s = new Simulation(
      level([...room(), P('fan', 'fan', 190, 470, { settings: { delay: 4 } }), P('ball', 'ball-tennis', 300, 483)]),
      empty,
    )
    run(s, 240)
    expect(velOf(s, 'ball').x).toBeCloseTo(0, 3)
    expect(part(s, 'fan').state.on).toBe(0)
    expect(part(s, 'fan').glow).toBe(0)
    s.step()
    expect(part(s, 'fan').state.on).toBe(1)
    expect(velOf(s, 'ball').x).toBeGreaterThan(0)
    expect(part(s, 'fan').glow).toBeGreaterThan(0)
    run(s, 60)
    expect(xOf(s, 'ball')).toBeGreaterThan(330)
  })

  it('a flipped fan blows the other way', () => {
    const s = new Simulation(level([...room(), P('fan', 'fan', 410, 470, { flip: true }), P('ball', 'ball-tennis', 300, 483)]), empty)
    run(s, 60)
    expect(xOf(s, 'ball')).toBeLessThan(270)
  })

  it('relaunch gives equal hash, events and part state', () => {
    // Fan (delay 1) blows the ball left into portal a; it falls out of b onto the spring, which
    // throws it back up. Off to the side, a magnet pulls a steel ball along a shelf.
    const lv = level([
      ...room(),
      P('fan', 'fan', 410, 470, { flip: true, settings: { delay: 1 } }),
      P('a', 'portal', 200, 470),
      P('ball', 'ball-base', 300, 482),
      P('b', 'portal', 700, 300, { rot: 6 }),
      P('spring', 'spring', 700, 600, { settings: { force: 5 } }),
      P('shelf', 'wall-brick', 1100, 700, { rot: 6, settings: { length: 8 } }),
      P('magnet', 'magnet', 1080, 680),
      P('iron', 'ball-base', 1150, 682),
    ])
    const before = JSON.parse(JSON.stringify(lv))
    const go = () => {
      const s = new Simulation(lv, empty)
      run(s, 59)
      const still = xOf(s, 'ball')
      run(s, 600)
      return {
        still,
        iron: xOf(s, 'iron'),
        hash: hashWorld(s.world),
        events: s.events,
        state: Object.fromEntries(s.parts.map((p) => [p.id, { ...p.state }])),
      }
    }
    const first = go()
    expect(first.still).toBeCloseTo(300, 3)
    const st = (id: string) => first.state[id]
    expect(st('fan').on).toBe(1)
    expect(st('a').teleports).toBeGreaterThan(0)
    expect(st('spring').launches).toBeGreaterThan(0)
    expect(st('magnet').pulls).toBeGreaterThan(0)
    expect(first.iron).toBeLessThan(1120)
    expect(go()).toEqual(first)
    expect(lv).toEqual(before)
  })

  it('the sandbox inventory offers the modern parts, portals in pairs', async () => {
    const sandbox = (await import('../../levels/00-sandbox.json')).default as Level
    const kinds = sandbox.inventory.map((i) => i.kind)
    for (const k of ['magnet', 'portal', 'spring', 'fan'] as PartKind[]) expect(kinds).toContain(k)
    expect(sandbox.inventory.find((i) => i.kind === 'portal')!.count % 2).toBe(0)
  })
})
