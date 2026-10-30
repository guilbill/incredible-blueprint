import { describe, expect, it } from 'vitest'
import { render } from '../../src/render/renderer'
import { Simulation } from '../../src/game/simulation'
import { motor } from '../../src/engine/joints'
import { bodyPose } from '../../src/engine/world'
import { v } from '../../src/engine/vec'
import type { Level, Link, Placement, Solution } from '../../src/level/types'
import { BELT_GAP, beltLoop, distanceToBelt, traceBelt } from '../../src/render/belt'
import { fakeCtx } from './fakeCtx'

describe('belt geometry', () => {
  it('uses the outer tangents', () => {
    const l = beltLoop(v(0, 0), 10, v(100, 0), 10)!
    expect(BELT_GAP).toBe(4)
    const ys = [l.a1.y, l.a2.y].sort((p, q) => p - q)
    expect(ys[0]).toBeCloseTo(-10)
    expect(ys[1]).toBeCloseTo(10)
    expect(l.a1.x).toBeCloseTo(0)
    expect(l.b1.x).toBeCloseTo(100)
    expect(l.b1.y).toBeCloseTo(l.a1.y)
    expect(l.b2.y).toBeCloseTo(l.a2.y)
  })

  it('is null when one wheel covers the other', () => {
    expect(beltLoop(v(0, 0), 30, v(10, 0), 10)).toBeNull()
  })

  it('measures the distance to the straight runs and the arcs', () => {
    const l = beltLoop(v(0, 0), 10, v(100, 0), 10)!
    expect(distanceToBelt(v(50, 10), l)).toBeCloseTo(0)
    expect(distanceToBelt(v(50, 0), l)).toBeCloseTo(10)
    expect(distanceToBelt(v(110, 0), l)).toBeCloseTo(0)
    expect(distanceToBelt(v(-10, 0), l)).toBeCloseTo(0)
    expect(distanceToBelt(v(120, 0), l)).toBeCloseTo(10)
  })

  it('traces a closed path with two arcs', () => {
    const { ctx, calls } = fakeCtx()
    traceBelt(ctx, beltLoop(v(0, 0), 10, v(100, 0), 10)!)
    expect(calls.filter((c) => c.startsWith('arc('))).toHaveLength(2)
    expect(calls.at(-1)).toBe('closePath()')
  })
})

const P = (id: string, kind: Placement['kind'], x: number, y: number): Placement => ({ id, kind, x, y, rot: 0, flip: false, settings: {} })
const lv = (fixed: Placement[], fixedLinks: Link[]): Level => ({ v: 1, id: 't', title: 't', fixed, fixedLinks, inventory: [], goals: [] })
const sol: Solution = { placements: [], links: [] }
const belt: Link = { id: 'b', kind: 'belt', a: { part: 'a', anchor: 'belt' }, b: { part: 'b', anchor: 'belt' } }

describe('belt rendering', () => {
  it('strokes the loop dashed, with the dash offset following the first wheel', () => {
    const level = lv([P('a', 'pulley', 200, 300), P('b', 'pulley', 400, 300)], [belt])
    const offsets = (sim?: Simulation): number[] => {
      const { ctx, calls } = fakeCtx()
      const out: number[] = []
      const proxy = new Proxy(ctx as unknown as Record<string, unknown>, {
        set: (t, k, val) => { if (k === 'lineDashOffset') out.push(val as number); return Reflect.set(t, k, val) },
        get: (t, k) => Reflect.get(t, k),
      }) as unknown as CanvasRenderingContext2D
      render(proxy, { level, sol, sim, zoom: 1 })
      expect(calls.filter((c) => c.startsWith('arc(200') || c.startsWith('arc(400')).length).toBeGreaterThan(0)
      return out
    }
    expect(offsets()).toContain(0)
    const sim = new Simulation(level, sol)
    motor(sim.parts.find((p) => p.id === 'a')!.anchors.belt.pin!, 3, 1e7)
    for (let i = 0; i < 30; i++) sim.step()
    const a = sim.parts.find((p) => p.id === 'a')!.anchors.belt
    const expected = -bodyPose(a.body).angle * (a.radius + BELT_GAP)
    expect(Math.abs(expected)).toBeGreaterThan(0.1)
    expect(offsets(sim)).toContainEqual(expect.closeTo(expected, 6))
  })
})
