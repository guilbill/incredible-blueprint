import { describe, expect, it } from 'vitest'
import { hashWorld } from '../../src/engine/hash'
import { v } from '../../src/engine/vec'
import { toU } from '../../src/engine/world'
import { Simulation } from '../../src/game/simulation'
import type { Level, Link, PartKind, Placement, Solution } from '../../src/level/types'
import { lineOfSight } from '../../src/parts/life/walker'
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
const xOf = (s: Simulation, id: string) => toU(part(s, id).bodies[0].getPosition().x)
const yOf = (s: Simulation, id: string) => toU(part(s, id).bodies[0].getPosition().y)
const names = (s: Simulation) => s.events.map((e) => e.name)

/** Floor from x 140 to 460, top at y 490; walls 1 cell wide at both ends (inner faces x 150 and 450). */
const room = (): Placement[] => [
  P('floor', 'wall-brick', 300, 500, { rot: 6, settings: { length: 16 } }),
  P('left', 'wall-brick', 140, 450, { settings: { length: 4 } }),
  P('right', 'wall-brick', 460, 450, { settings: { length: 4 } }),
]

describe('living characters', () => {
  it('registers the characters with their sizes and anchors', () => {
    expect(partDef('mouse').size).toEqual({ w: 1, h: 1 })
    expect(partDef('cat').size).toEqual({ w: 2, h: 2 })
    expect(partDef('cheese').size).toEqual({ w: 1, h: 1 })
    expect(partDef('cheese').anchors).toEqual([expect.objectContaining({ key: 'rope', role: 'rope' })])
    expect(partDef('mousetrap').size).toEqual({ w: 2, h: 1 })
    expect(partDef('fishbowl').size).toEqual({ w: 2, h: 2 })
  })

  it('the mouse walks to the cheese on a flat floor and eats it', () => {
    const s = new Simulation(level([...room(), P('mouse', 'mouse', 200, 480), P('cheese', 'cheese', 330, 480)]), empty)
    run(s, 30)
    const vx = toU(part(s, 'mouse').bodies[0].getLinearVelocity().x)
    expect(vx).toBeCloseTo(80, -1)
    expect(part(s, 'mouse').glow).toBeGreaterThan(0)
    run(s, 210)
    expect(names(s)).toEqual(['cheese-eaten'])
    expect(s.events[0].part).toBe('cheese')
    expect(part(s, 'cheese').state.eaten).toBe(1)
    expect(part(s, 'cheese').bodies[0].isActive()).toBe(false)
  })

  it('the mouse turns around at a wall and still reaches the cheese behind it', () => {
    // Upper shelf x 220..380 (top 390) with a wall at x 370; the cheese waits on the lower floor, out of sight.
    const s = new Simulation(
      level([
        P('shelf', 'wall-brick', 300, 400, { rot: 6, settings: { length: 8 } }),
        P('stop', 'wall-wood', 370, 370, { settings: { length: 2 } }),
        P('floor', 'wall-brick', 200, 500, { rot: 6, settings: { length: 10 } }),
        P('mouse', 'mouse', 320, 380),
        P('cheese', 'cheese', 120, 480),
      ]),
      empty,
    )
    expect(lineOfSight(v(320, 380), v(120, 480), s, [part(s, 'cheese').bodies[0]])).toBe(false)
    let maxX = 0
    for (let i = 0; i < 900 && !names(s).includes('cheese-eaten'); i++) {
      s.step()
      maxX = Math.max(maxX, xOf(s, 'mouse'))
    }
    expect(maxX).toBeGreaterThan(340)
    expect(maxX).toBeLessThan(360)
    expect(names(s)).toEqual(['cheese-eaten'])
  })

  it('the cat stays asleep with no trigger', () => {
    const s = new Simulation(level([...room(), P('cat', 'cat', 300, 470)]), empty)
    run(s, 240)
    expect(part(s, 'cat').state.awake).toBe(0)
    expect(xOf(s, 'cat')).toBeCloseTo(300, 1)
    expect(s.events).toEqual([])
  })

  it('a hard hit wakes the cat, a light touch does not', () => {
    const hit = new Simulation(level([...room(), P('cat', 'cat', 300, 470), P('ball', 'ball-bowling', 300, 380)]), empty)
    run(hit, 60)
    expect(part(hit, 'cat').state.awake).toBe(1)
    const soft = new Simulation(level([...room(), P('cat', 'cat', 300, 470), P('ball', 'ball-tennis', 300, 442)]), empty)
    run(soft, 60)
    expect(part(soft, 'cat').state.awake).toBe(0)
  })

  it('a cat woken by a nearby mouse chases and catches it on its floor', () => {
    // The mouse walks left toward the cat, wakes it within 8 cells, flees right and gets cornered.
    const s = new Simulation(level([...room(), P('cat', 'cat', 200, 470), P('mouse', 'mouse', 400, 480, { flip: true })]), empty)
    let woke = -1
    for (let i = 0; i < 900 && !names(s).includes('mouse-caught'); i++) {
      s.step()
      if (woke < 0 && part(s, 'cat').state.awake) woke = i
    }
    expect(woke).toBeGreaterThan(0)
    expect(names(s)).toEqual(['mouse-caught'])
    expect(s.events[0].part).toBe('mouse')
    expect(part(s, 'mouse').state.caught).toBe(1)
    expect(part(s, 'mouse').bodies[0].isActive()).toBe(false)
  })

  it('the cat does not see a mouse behind a wall', () => {
    const s = new Simulation(
      level([...room(), P('cat', 'cat', 200, 470), P('mid', 'wall-brick', 260, 450, { settings: { length: 4 } }), P('mouse', 'mouse', 320, 480)]),
      empty,
    )
    expect(lineOfSight(v(200, 470), v(320, 480), s)).toBe(false)
    expect(lineOfSight(v(280, 470), v(320, 480), s)).toBe(true)
    run(s, 600)
    expect(part(s, 'cat').state.awake).toBe(0)
    expect(s.events).toEqual([])
  })

  it('a wall stops the awake cat: it sits and does not turn around', () => {
    // The mouse runs on a 1-cell step (x 300..460): the cat sees it over the step but cannot climb it.
    const s = new Simulation(
      level([
        ...room(), P('step', 'wall-brick', 380, 480, { rot: 6, settings: { length: 8 } }),
        P('cat', 'cat', 200, 470), P('ball', 'ball-bowling', 200, 380), P('mouse', 'mouse', 400, 460),
      ]),
      empty,
    )
    expect(lineOfSight(v(200, 470), v(400, 460), s)).toBe(true)
    run(s, 240)
    const cat = part(s, 'cat')
    expect(cat.state.awake).toBe(1)
    expect(cat.state.sitting).toBe(1)
    const x = xOf(s, 'cat')
    expect(x).toBeGreaterThan(260)
    expect(x).toBeLessThan(285)
    run(s, 60)
    expect(xOf(s, 'cat')).toBeCloseTo(x, 0)
    expect(s.events).toEqual([])
  })

  it('the mouse is held, not free, inside a mouse cage', () => {
    const s = new Simulation(level([P('cage', 'mouse-cage', 300, 300), P('mouse', 'mouse', 300, 300)]), empty)
    run(s, 60)
    expect(part(s, 'mouse').state.held).toBe(1)
    expect(xOf(s, 'mouse')).toBe(300)
    expect(yOf(s, 'mouse')).toBe(300)
  })

  it('the mouse springs the trap: it is held and a tennis ball on the bar is thrown upward', () => {
    const s = new Simulation(
      level([...room(), P('trap', 'mousetrap', 300, 480), P('ball', 'ball-tennis', 310, 477), P('mouse', 'mouse', 230, 480)]),
      empty,
    )
    let minY = 1000
    for (let i = 0; i < 360; i++) {
      s.step()
      minY = Math.min(minY, yOf(s, 'ball'))
    }
    expect(names(s)).toEqual(['trap-snapped'])
    expect(s.events[0].part).toBe('trap')
    expect(part(s, 'trap').state.snapped).toBe(1)
    expect(part(s, 'mouse').state.held).toBe(1)
    // 600 units/s straight up rises ~200 units.
    expect(minY).toBeLessThan(330)
  })

  it('the fishbowl survives resting, breaks on a hard hit or a tilt, and spawns a fish', () => {
    const rest = new Simulation(level([...room(), P('bowl', 'fishbowl', 300, 470)]), empty)
    run(rest, 240)
    expect(part(rest, 'bowl').state.broken).toBe(0)
    const hit = new Simulation(level([...room(), P('bowl', 'fishbowl', 300, 470), P('ball', 'ball-bowling', 300, 380)]), empty)
    run(hit, 60)
    expect(names(hit)).toEqual(['bowl-broken'])
    const bowl = part(hit, 'bowl')
    expect(bowl.state.broken).toBe(1)
    expect(bowl.bodies).toHaveLength(2)
    expect(bowl.bodies[0].isActive()).toBe(false)
    run(hit, 60)
    expect(toU(bowl.bodies[1].getPosition().y)).toBeGreaterThan(470)
    const tilt = new Simulation(level([...room(), P('bowl', 'fishbowl', 300, 470)]), empty)
    const b = tilt.parts.find((p) => p.id === 'bowl')!.bodies[0]
    b.setTransform(b.getPosition(), 1.2)
    run(tilt, 1)
    expect(part(tilt, 'bowl').state.broken).toBe(1)
  })

  it('an awake cat goes for the fish of a broken bowl', () => {
    const s = new Simulation(
      level([...room(), P('cat', 'cat', 200, 470), P('bowl', 'fishbowl', 380, 470), P('ball', 'ball-bowling', 380, 380), P('wake', 'ball-bowling', 200, 380)]),
      empty,
    )
    run(s, 600)
    expect(names(s)).toContain('bowl-broken')
    expect(part(s, 'bowl').state.fishEaten).toBe(1)
    expect(xOf(s, 'cat')).toBeGreaterThan(300)
  })

  it('relaunch gives equal hash, events and part state', () => {
    const lv = level(
      [
        ...room(),
        P('cat', 'cat', 200, 470), P('mouse', 'mouse', 400, 480, { flip: true }),
        P('floor2', 'wall-brick', 800, 500, { rot: 6, settings: { length: 16 } }),
        P('mouse2', 'mouse', 700, 480), P('cheese', 'cheese', 820, 480),
        P('trap', 'mousetrap', 900, 480), P('ball', 'ball-tennis', 910, 477),
        P('bowl', 'fishbowl', 760, 300), P('hook', 'ball-base', 760, 200),
      ],
      [L('r', 'rope', ['cheese', 'rope'], ['hook', 'center'])],
    )
    const before = JSON.parse(JSON.stringify(lv))
    const go = () => {
      const s = new Simulation(lv, empty)
      run(s, 900)
      return { hash: hashWorld(s.world), events: s.events, state: s.parts.map((p) => ({ ...p.state })) }
    }
    const first = go()
    const fired = first.events.map((e) => e.name)
    expect(fired).toContain('cheese-eaten')
    expect(fired).toContain('mouse-caught')
    expect(fired).toContain('trap-snapped')
    expect(fired).toContain('bowl-broken')
    expect(go()).toEqual(first)
    expect(lv).toEqual(before)
  })

  it('the sandbox inventory offers the living characters', async () => {
    const sandbox = (await import('../../levels/00-sandbox.json')).default as Level
    const kinds = sandbox.inventory.map((i) => i.kind)
    for (const k of ['cat', 'mouse', 'cheese', 'mousetrap', 'fishbowl'] as PartKind[]) expect(kinds).toContain(k)
  })
})
