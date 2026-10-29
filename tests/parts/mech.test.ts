import { describe, expect, it } from 'vitest'
import { hashWorld } from '../../src/engine/hash'
import { motor } from '../../src/engine/joints'
import { toM, toU } from '../../src/engine/world'
import { Simulation } from '../../src/game/simulation'
import type { Level, Link, PartKind, Placement, Solution } from '../../src/level/types'
import { gearOutline, gearPhases } from '../../src/parts/mech/gear'
import { canLink } from '../../src/parts/mech/links'
import type { PartInstance } from '../../src/parts/types'
import { partDef } from '../../src/parts/registry'
import { Pen } from '../../src/render/pen'
import { fakeCtx } from '../render/fakeCtx'

const P = (id: string, kind: PartKind, x: number, y: number, o: Partial<Placement> = {}): Placement => ({
  id, kind, x, y, rot: 0, flip: false, settings: {}, ...o,
})

const L = (id: string, kind: Link['kind'], a: [string, string], b: [string, string]): Link => ({
  id, kind, a: { part: a[0], anchor: a[1] }, b: { part: b[0], anchor: b[1] },
})

const level = (fixed: Placement[], fixedLinks: Link[] = []): Level => ({
  v: 1, id: 't', title: 't', goalText: 't', fixed, fixedLinks, inventory: [], goals: [],
})
const empty: Solution = { placements: [], links: [] }

const part = (s: Simulation, id: string) => s.parts.find((p) => p.id === id)!

const run = (s: Simulation, n: number) => {
  for (let i = 0; i < n; i++) s.step()
}

describe('mechanics', () => {
  it('registers the mechanical parts with their anchors', () => {
    expect(partDef('gear-small').size).toEqual({ w: 2, h: 2 })
    expect(partDef('gear-large').size).toEqual({ w: 4, h: 4 })
    expect(partDef('pulley').anchors).toEqual([expect.objectContaining({ key: 'belt', role: 'belt' })])
    expect(partDef('conveyor').size).toEqual({ w: 6, h: 1 })
    expect(partDef('conveyor').anchors).toEqual([expect.objectContaining({ key: 'belt', role: 'belt' })])
    expect(partDef('scissors').size).toEqual({ w: 2, h: 2 })
    expect(partDef('ball-base').anchors).toEqual([expect.objectContaining({ role: 'rope', local: { x: 0, y: 0 } })])
    expect(partDef('seesaw').anchors.map((a) => a.role)).toEqual(['rope', 'rope'])
  })

  it('two meshing gears turn opposite ways at the expected ratio', () => {
    const s = new Simulation(level([P('a', 'gear-small', 400, 400), P('b', 'gear-large', 460, 400)]), empty)
    const a = part(s, 'a')
    const b = part(s, 'b')
    motor(a.anchors.belt.pin!, 4, 1e7)
    run(s, 60)
    const wa = a.bodies[0].getAngularVelocity()
    const wb = b.bodies[0].getAngularVelocity()
    expect(wa).toBeCloseTo(4, 1)
    expect(wb).toBeCloseTo(-2, 1)
    expect(b.glow).toBeGreaterThan(0)
  })

  it('gears that do not touch do not mesh', () => {
    const s = new Simulation(level([P('a', 'gear-small', 400, 400), P('b', 'gear-large', 480, 400)]), empty)
    motor(part(s, 'a').anchors.belt.pin!, 4, 1e7)
    run(s, 60)
    expect(Math.abs(part(s, 'b').bodies[0].getAngularVelocity())).toBeLessThan(0.01)
  })

  it('a belt makes the conveyor move a box', () => {
    const lv = level(
      [P('drive', 'pulley', 200, 300), P('belt', 'conveyor', 400, 400), P('box', 'bucket', 400, 370)],
      [L('l1', 'belt', ['drive', 'belt'], ['belt', 'belt'])],
    )
    const s = new Simulation(lv, empty)
    const box = part(s, 'box').bodies[0]
    const x0 = toU(box.getPosition().x)
    motor(part(s, 'drive').anchors.belt.pin!, 3, 1e7)
    run(s, 120)
    // Pulley r 20, conveyor wheel r 10: the wheel turns twice as fast as the pulley.
    expect(part(s, 'belt').bodies[1].getAngularVelocity()).toBeCloseTo(6, 1)
    expect(toU(box.getPosition().x) - x0).toBeGreaterThan(40)
    expect(part(s, 'belt').glow).toBeGreaterThan(0)
  })

  it('a conveyor that starts late still moves a box that fell asleep on it', () => {
    const lv = level(
      [P('drive', 'pulley', 200, 300), P('belt', 'conveyor', 400, 400), P('box', 'ball-base', 400, 382)],
      [L('l1', 'belt', ['drive', 'belt'], ['belt', 'belt'])],
    )
    const s = new Simulation(lv, empty)
    const box = part(s, 'box').bodies[0]
    run(s, 240)
    expect(box.isAwake()).toBe(false)
    const x0 = toU(box.getPosition().x)
    motor(part(s, 'drive').anchors.belt.pin!, 3, 1e7)
    run(s, 60)
    expect(toU(box.getPosition().x) - x0).toBeGreaterThan(10)
  })

  it('a ball pushed into the scissors handle cuts the rope holding a bucket, which then falls', () => {
    const lv = level(
      [P('saw', 'seesaw', 400, 300), P('bucket', 'bucket', 460, 420), P('cut', 'scissors', 470, 360), P('ball', 'ball-bowling', 540, 360)],
      [L('rope', 'rope', ['saw', 'right'], ['bucket', 'handle'])],
    )
    const s = new Simulation(lv, empty)
    expect(s.ropes).toHaveLength(1)
    const bucket = part(s, 'bucket').bodies[0]
    part(s, 'ball').bodies[0].setLinearVelocity({ x: toM(-400), y: 0 })
    run(s, 5)
    expect(part(s, 'cut').state.closed).toBe(0)
    run(s, 25)
    expect(part(s, 'cut').state.closed).toBe(1)
    expect(s.ropes[0].enabled).toBe(false)
    expect(s.events).toEqual([expect.objectContaining({ name: 'rope-cut', part: 'cut' })])
    run(s, 60)
    expect(toU(bucket.getPosition().y)).toBeGreaterThan(500)
  })

  it('without the hit, the rope keeps holding the bucket', () => {
    const lv = level(
      [P('saw', 'seesaw', 400, 300), P('bucket', 'bucket', 460, 420), P('cut', 'scissors', 470, 360)],
      [L('rope', 'rope', ['saw', 'right'], ['bucket', 'handle'])],
    )
    const s = new Simulation(lv, empty)
    run(s, 240)
    expect(s.ropes[0].enabled).toBe(true)
    expect(toU(part(s, 'bucket').bodies[0].getPosition().y)).toBeLessThan(450)
  })

  it('canLink refuses rope to belt, same part and unknown anchors', () => {
    const parts = [P('b', 'ball-base', 100, 100), P('s', 'seesaw', 300, 300), P('p', 'pulley', 500, 100), P('q', 'pulley', 600, 100)]
    const A = (part: string, anchor: string) => ({ part, anchor })
    expect(canLink(A('b', 'center'), A('s', 'left'), parts)).toBe(true)
    expect(canLink(A('p', 'belt'), A('q', 'belt'), parts)).toBe(true)
    expect(canLink(A('b', 'center'), A('p', 'belt'), parts)).toBe(false)
    expect(canLink(A('s', 'left'), A('s', 'right'), parts)).toBe(false)
    expect(canLink(A('b', 'nope'), A('s', 'left'), parts)).toBe(false)
    expect(canLink(A('x', 'center'), A('s', 'left'), parts)).toBe(false)
  })

  it('canLink refuses a belt between two gears that already mesh', () => {
    const A = (part: string) => ({ part, anchor: 'belt' })
    const meshed = [P('s', 'gear-small', 100, 100), P('l', 'gear-large', 160, 100), P('far', 'gear-small', 300, 100)]
    expect(canLink(A('s'), A('l'), meshed)).toBe(false)
    expect(canLink(A('l'), A('s'), meshed)).toBe(false)
    expect(canLink(A('s'), A('far'), meshed)).toBe(true)
  })

  it('skips a belt between meshed gears found in a level, keeping only the mesh', () => {
    const fixed = [P('s', 'gear-small', 100, 100), P('l', 'gear-large', 160, 100)]
    const count = (s: Simulation) => {
      let n = 0
      for (let j = s.world.pl.getJointList(); j; j = j.getNext()) n++
      return n
    }
    const plain = new Simulation(level(fixed), empty)
    const belted = new Simulation(level(fixed, [L('k', 'belt', ['s', 'belt'], ['l', 'belt'])]), empty)
    expect(count(belted)).toBe(count(plain))
  })

  it('relaunch gives equal hash, events and part state (cut rope, belt-driven conveyor)', () => {
    const lv = level(
      [
        P('saw', 'seesaw', 400, 300), P('bucket', 'bucket', 460, 420), P('cut', 'scissors', 470, 360),
        P('drop', 'ball-bowling', 482, 200),
        P('g', 'gear-large', 200, 500), P('g2', 'gear-small', 260, 500), P('kick', 'ball-bowling', 236, 300),
        P('belt', 'conveyor', 600, 640), P('box', 'ball-base', 600, 620),
      ],
      [L('rope', 'rope', ['saw', 'right'], ['bucket', 'handle']), L('l2', 'belt', ['g', 'belt'], ['belt', 'belt'])],
    )
    const before = JSON.parse(JSON.stringify(lv))
    const go = () => {
      const s = new Simulation(lv, empty)
      run(s, 600)
      return { hash: hashWorld(s.world), events: s.events, state: Object.fromEntries(s.parts.map((p) => [p.id, p.state])) }
    }
    const first = go()
    expect(first.events.map((e) => e.name)).toEqual(['rope-cut'])
    expect(first.state.cut).toEqual({ closed: 1 })
    expect(go()).toEqual(first)
    expect(lv).toEqual(before)
  })
})

describe('gear drawing', () => {
  const at = (id: string, kind: PartKind, x: number, y: number) => P(id, kind, x, y)

  it('outlines a gear with r / 2 trapezoid teeth between r - 3 and r + 3', () => {
    const c = { x: 50, y: 60 }
    const pts = gearOutline(c, 0, 20)
    const d = pts.map((p) => Math.sqrt((p.x - c.x) ** 2 + (p.y - c.y) ** 2))
    expect(Math.min(...d)).toBeGreaterThanOrEqual(17 - 1e-9)
    expect(Math.max(...d)).toBeCloseTo(23, 9)
    expect(pts.length).toBe(10 * 6)
    expect(d.filter((x) => Math.abs(x - 23) < 1e-9).length).toBe(10 * 3)
    const near0 = pts.filter((p) => Math.abs(Math.atan2(p.y - c.y, p.x - c.x)) < 0.05)
    expect(Math.max(...near0.map((p) => Math.sqrt((p.x - c.x) ** 2 + (p.y - c.y) ** 2)))).toBeCloseTo(23, 9)
  })

  it('phases a meshing pair so teeth fall in gaps', () => {
    const ph = gearPhases([at('s', 'gear-small', 100, 100), at('l', 'gear-large', 160, 100)])
    expect(ph.get('s')).toBe(0)
    const expected = Math.PI + Math.PI / 20
    const diff = (((ph.get('l')! - expected) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    expect(Math.min(diff, 2 * Math.PI - diff)).toBeLessThan(1e-9)
  })

  it('gives a gear with no partner phase 0 and survives a cycle of gears', () => {
    expect(gearPhases([at('a', 'gear-small', 100, 100)]).get('a')).toBe(0)
    // Three small gears on an equilateral triangle (side 40) all mesh each other.
    const tri = [at('a', 'gear-small', 100, 100), at('b', 'gear-small', 140, 100), at('c', 'gear-small', 120, 100 + 40 * Math.sin(Math.PI / 3))]
    const ph = gearPhases(tri)
    expect([...ph.keys()].sort()).toEqual(['a', 'b', 'c'])
    expect(ph.get('a')).toBe(0)
    expect([...ph.values()].every(Number.isFinite)).toBe(true)
  })

  it('draws a gear with phase 1 like phase 0 with the body turned by 1', () => {
    const rec = (phase: number, angle: number) => {
      const f = fakeCtx()
      const inst = { bodies: [{ getPosition: () => ({ x: 0, y: 0 }), getAngle: () => angle }] } as unknown as PartInstance
      partDef('gear-large').draw!(new Pen(f.ctx), { placement: at('g', 'gear-large', 0, 0), inst, phase })
      return f.calls
    }
    expect(rec(1, 0)).toEqual(rec(0, 1))
  })
})
