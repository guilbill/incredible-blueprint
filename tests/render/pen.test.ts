import { describe, expect, it } from 'vitest'
import { hashWorld } from '../../src/engine/hash'
import { Simulation } from '../../src/game/simulation'
import type { Level, Placement } from '../../src/level/types'
import { render } from '../../src/render/renderer'

/** Fake 2D context: records calls, remembers property sets. */
function fakeCtx() {
  const calls: string[] = []
  const props: Record<string, unknown> = {}
  const maxBlur = { v: 0 }
  const trailStrokes = { v: 0 }
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k: string) =>
      k in props
        ? props[k]
        : (...a: unknown[]) => {
            calls.push(`${k}(${a.join(',')})`)
            if (k === 'stroke' && props.lineWidth === 2 && props.strokeStyle === '#7fffd4') trailStrokes.v++
          },
    set: (_t, k: string, val) => {
      props[k] = val
      if (k === 'shadowBlur') maxBlur.v = Math.max(maxBlur.v, val as number)
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls, maxBlur, trailStrokes }
}

const P = (id: string, kind: Placement['kind'], x: number, y: number): Placement => ({ id, kind, x, y, rot: 0, flip: false, settings: {} })
const level = (fixed: Placement[] = []): Level => ({
  v: 1, id: 't', title: 't', goalText: '', fixed, fixedLinks: [], inventory: [],
  goals: [{ type: 'inZone', part: 'b', zone: { x: 100, y: 100, w: 60, h: 60 } }],
})

describe('render', () => {
  it('renders an empty level without throwing', () => {
    const { ctx, calls } = fakeCtx()
    render(ctx, { level: level(), sol: { placements: [], links: [] }, zoom: 1 })
    expect(calls.length).toBeGreaterThan(0)
  })

  it('draws every base part, placed and simulated', () => {
    const kinds = ['ball-bowling', 'ball-base', 'ball-basket', 'ball-tennis', 'wall-brick', 'wall-wood', 'ramp', 'bucket', 'trampoline', 'seesaw'] as const
    const placements = kinds.map((k, i) => P(k, k, 100 + i * 100, 300))
    const lvl = level([placements[0]])
    const sol = { placements: placements.slice(1), links: [] }
    render(fakeCtx().ctx, { level: lvl, sol, zoom: 1, ghost: { placement: P('g', 'ramp', 50, 50), ghost: 'bad' } })
    const sim = new Simulation(lvl, sol)
    for (let i = 0; i < 5; i++) {
      sim.step()
      render(fakeCtx().ctx, { level: lvl, sol, sim, zoom: 0.5 })
    }
  })

  it('glows a part whose glow is above zero', () => {
    const b = P('b', 'ball-base', 200, 200)
    const lvl = level()
    const sol = { placements: [b], links: [] }
    const sim = new Simulation(lvl, sol)
    const quiet = fakeCtx()
    render(quiet.ctx, { level: lvl, sol, sim, zoom: 1 })
    expect(quiet.maxBlur.v).toBe(0)
    sim.parts.find((p) => p.id === 'b')!.glow = 1
    const lit = fakeCtx()
    render(lit.ctx, { level: lvl, sol, sim, zoom: 1 })
    expect(lit.maxBlur.v).toBe(12)
  })

  it('caps the trail at 40 points (39 segments) and leaves the sim untouched', () => {
    const lvl = level()
    const sol = { placements: [P('b', 'ball-base', 200, 100)], links: [] }
    const sim = new Simulation(lvl, sol)
    const early = fakeCtx()
    for (let i = 0; i < 100; i++) {
      sim.step()
      const f = fakeCtx()
      render(f.ctx, { level: lvl, sol, sim, zoom: 1 })
      if (i === 10) early.trailStrokes.v = f.trailStrokes.v
      if (i === 99) expect(f.trailStrokes.v).toBe(39)
    }
    expect(early.trailStrokes.v).toBeLessThan(39)
    const before = hashWorld(sim.world)
    const steps = sim.stepIndex
    render(fakeCtx().ctx, { level: lvl, sol, sim, zoom: 1 })
    render(fakeCtx().ctx, { level: lvl, sol, sim, zoom: 2 })
    expect(hashWorld(sim.world)).toBe(before)
    expect(sim.stepIndex).toBe(steps)
  })

  it('outlines the selected placement and makes goal zones glow yellow when won', () => {
    const sol = { placements: [P('s', 'ball-tennis', 300, 300)], links: [] }
    const plain = fakeCtx()
    render(plain.ctx, { level: level(), sol, zoom: 1 })
    const sel = fakeCtx()
    render(sel.ctx, { level: level(), sol, selected: 's', zoom: 1 })
    expect(sel.calls.filter((c) => c.startsWith('stroke(')).length).toBeGreaterThan(plain.calls.filter((c) => c.startsWith('stroke(')).length)
    const won = fakeCtx()
    render(won.ctx, { level: level(), sol, won: true, zoom: 1 })
    expect(won.calls).toContain('fillRect(100,100,60,60)')
    expect(won.maxBlur.v).toBeGreaterThan(plain.maxBlur.v)
  })
})
