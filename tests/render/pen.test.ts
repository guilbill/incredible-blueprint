import { describe, expect, it } from 'vitest'
import { hashWorld } from '../../src/engine/hash'
import { Simulation } from '../../src/game/simulation'
import type { Level, Placement } from '../../src/level/types'
import { v } from '../../src/engine/vec'
import { FIELD } from '../../src/level/placement'
import { NUDGE_MS, TRAIL_BANDS, chevronOffset, labelDone, render } from '../../src/render/renderer'
import { gearPhases } from '../../src/parts/mech/gear'
import { partDef } from '../../src/parts/registry'
import { Pen } from '../../src/render/pen'
import { fakeCtx } from './fakeCtx'

const P = (id: string, kind: Placement['kind'], x: number, y: number): Placement => ({ id, kind, x, y, rot: 0, flip: false, settings: {} })
const level = (fixed: Placement[] = []): Level => ({
  v: 1, id: 't', title: 't', fixed, fixedLinks: [], inventory: [],
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

  it('draws no permanent labels', () => {
    const lvl = level([P('b', 'ball-base', 200, 200)])
    const sol = { placements: [P('r', 'ramp', 400, 300)], links: [] }
    const edit = fakeCtx()
    render(edit.ctx, { level: lvl, sol, zoom: 1 })
    expect(edit.calls.filter((c) => c.startsWith('fillText('))).toEqual([])
  })

  it('labels the hovered part FIG. n after its place in fixed + placements, and not while running', () => {
    const lvl = level([P('b', 'ball-base', 200, 200)])
    const sol = { placements: [P('r', 'ramp', 400, 300)], links: [] }
    const f = fakeCtx()
    render(f.ctx, { level: lvl, sol, zoom: 1, hover: { id: 'r', t: 1000 } })
    const texts = f.calls.filter((c) => c.startsWith('fillText('))
    expect(texts).toHaveLength(1)
    expect(texts[0].startsWith('fillText(FIG. 2 · ')).toBe(true)
    const run = fakeCtx()
    render(run.ctx, { level: lvl, sol, sim: new Simulation(lvl, sol), zoom: 1, hover: { id: 'r', t: 1000 } })
    expect(run.calls.filter((c) => c.startsWith('fillText('))).toEqual([])
  })

  it('fades the label in after the leader line', () => {
    const lvl = level([P('b', 'ball-base', 200, 200)])
    const sol = { placements: [], links: [] }
    const early = fakeCtx()
    render(early.ctx, { level: lvl, sol, zoom: 1, hover: { id: 'b', t: 100 } })
    const e = early.events.find((x) => x.name === 'fillText')
    expect(e === undefined || e.props.globalAlpha === 0).toBe(true)
    const mid = fakeCtx()
    render(mid.ctx, { level: lvl, sol, zoom: 1, hover: { id: 'b', t: 250 } })
    expect(mid.events.find((x) => x.name === 'fillText')?.props.globalAlpha).toBeCloseTo(0.5)
    expect(labelDone(339)).toBe(false)
    expect(labelDone(340)).toBe(true)
  })

  it('keeps the label inside the field near the edge', () => {
    const lvl = level([P('b', 'ball-base', FIELD.w - 30, 20)])
    const f = fakeCtx()
    render(f.ctx, { level: lvl, sol: { placements: [], links: [] }, zoom: 1, hover: { id: 'b', t: 1000 } })
    const e = f.events.find((x) => x.name === 'fillText')!
    const text = e.args[0] as string
    expect(e.args[1] as number).toBeGreaterThanOrEqual(0)
    expect(e.args[1] as number).toBeLessThanOrEqual(FIELD.w - text.length * 5.4)
    expect(e.args[2] as number).toBeGreaterThanOrEqual(0)
    expect(e.args[2] as number).toBeLessThanOrEqual(FIELD.h)
  })

  it('pulses the link targets: a dot and a growing, fading ring each, in cyan, without blur', () => {
    const lvl = level([P('a', 'pulley', 100, 100), P('b', 'pulley', 300, 100)])
    const f = fakeCtx()
    render(f.ctx, {
      level: lvl, sol: { placements: [], links: [] }, zoom: 1, pulse: 0.5,
      targets: [{ part: 'a', anchor: 'belt' }, { part: 'b', anchor: 'belt' }],
    })
    const arcs = f.events.filter((x) => x.name === 'arc')
    const dots = arcs.filter((x) => x.args[2] === 5 && x.props.fillStyle === '#7fffd4')
    expect(dots).toHaveLength(2)
    const rings = arcs.filter((x) => x.args[2] === 5 + 13 * 0.5 && x.props.strokeStyle === '#7fffd4')
    expect(rings).toHaveLength(2)
    expect(rings.every((r) => r.props.globalAlpha === 0.5)).toBe(true)
    expect(f.maxBlur.v).toBe(0)
  })

  it('draws the pending link as a yellow dashed line', () => {
    const f = fakeCtx()
    render(f.ctx, { level: level(), sol: { placements: [], links: [] }, zoom: 1, pendingLine: { from: v(10, 10), to: v(50, 60) } })
    const e = f.events.find((x) => x.name === 'lineTo' && x.args[0] === 50 && x.args[1] === 60)!
    expect(e.props.strokeStyle).toBe('#ffcf5a')
    expect(f.events.some((x) => x.name === 'setLineDash' && (x.args[0] as number[]).length > 0)).toBe(true)
  })

  it('outlines the first part of a pending link as a yellow dashed footprint', () => {
    const lvl = level([P('b', 'ball-base', 200, 200)])
    const f = fakeCtx()
    render(f.ctx, { level: lvl, sol: { placements: [], links: [] }, zoom: 1, pendingAnchor: { part: 'b', anchor: 'center' } })
    let dash = false
    let seen = false
    for (const x of f.events) {
      if (x.name === 'setLineDash') dash = (x.args[0] as number[]).length > 0
      if (x.name === 'stroke' && dash && x.props.strokeStyle === '#ffcf5a' && x.props.lineWidth === 1) seen = true
    }
    expect(seen).toBe(true)
  })

  it('marks the meshing contacts of a dragged gear', () => {
    const f = fakeCtx()
    render(f.ctx, { level: level(), sol: { placements: [], links: [] }, zoom: 1, meshMarks: [v(70, 80)] })
    const arcs = f.events.filter((x) => x.name === 'arc' && x.args[0] === 70 && x.args[1] === 80)
    const ring = arcs.find((x) => x.args[2] === 7)!
    expect(ring.props.strokeStyle).toBe('#7fffd4')
    expect(ring.props.lineWidth).toBe(2)
    expect(arcs.some((x) => x.args[2] === 2.5 && x.props.fillStyle === '#7fffd4')).toBe(true)
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

  it('caps the trail at 40 points (39 segments in a few unblurred strokes) and leaves the sim untouched', () => {
    const lvl = level()
    const sol = { placements: [P('b', 'ball-base', 200, 100)], links: [] }
    const sim = new Simulation(lvl, sol)
    const early = fakeCtx()
    for (let i = 0; i < 100; i++) {
      sim.step()
      const f = fakeCtx()
      render(f.ctx, { level: lvl, sol, sim, zoom: 1 })
      if (i === 10) early.trailSegments.v = f.trailSegments.v
      if (i === 99) {
        expect(f.trailSegments.v).toBe(39)
        expect(f.trailStrokes.v).toBe(TRAIL_BANDS)
        expect(f.maxBlur.v).toBe(0)
      }
    }
    expect(early.trailSegments.v).toBeLessThan(39)
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
    render(sel.ctx, { level: level(), sol, selected: ['s'], zoom: 1 })
    expect(sel.calls.filter((c) => c.startsWith('stroke(')).length).toBeGreaterThan(plain.calls.filter((c) => c.startsWith('stroke(')).length)
    const won = fakeCtx()
    render(won.ctx, { level: level(), sol, won: true, zoom: 1 })
    expect(won.calls).toContain('fillRect(100,100,60,60)')
    expect(won.maxBlur.v).toBeGreaterThan(plain.maxBlur.v)
  })

  it('draws a dashed selection box', () => {
    const sol = { placements: [P('b', 'ball-tennis', 300, 300)], links: [] }
    const f = fakeCtx()
    render(f.ctx, { level: level(), sol, selected: ['b'], selectionBox: { x: 280, y: 280, w: 40, h: 40 }, zoom: 1 })
    const dash = f.events.find((e) => e.name === 'setLineDash' && (e.args[0] as number[]).join() === '6,4' && e.props.strokeStyle === '#ffcf5a' && e.props.lineWidth === 1)
    expect(dash).toBeDefined()
    expect(f.calls).toContain('strokeRect(272,272,56,56)')
  })

  it('draws a ghost gear with the phase of its new position, not of the placement it replaces', () => {
    const small = P('s', 'gear-small', 100, 100)
    const oldLarge = P('l', 'gear-large', 400, 400)
    const moved = P('l', 'gear-large', 160, 100)
    const lvl = level()
    const f = fakeCtx()
    render(f.ctx, { level: lvl, sol: { placements: [oldLarge, small], links: [] }, zoom: 1, ghost: { placement: moved, ghost: 'ok' } })
    // Same gear drawn alone with the phase it gets next to the small one.
    const ref = fakeCtx()
    const phase = gearPhases([small, moved]).get('l')
    const pen = new Pen(ref.ctx)
    ref.ctx.save()
    ref.ctx.globalAlpha = 0.5
    partDef('gear-large').draw!(pen, { placement: moved, ghost: 'ok', phase })
    const drawn = ref.calls.slice(1)
    const all = f.calls.join('|')
    expect(drawn.length).toBeGreaterThan(0)
    expect(all).toContain(drawn.join('|'))
  })
})

describe('part handles', () => {
  const lvl: Level = { v: 1, id: 't', title: 't', fixed: [], fixedLinks: [], inventory: [], goals: [] }
  const sol = { placements: [{ id: 'r', kind: 'ramp' as const, x: 400, y: 300, rot: 0, flip: false, settings: { length: 4 } }], links: [] }
  const at = { rot: v(400, 268), start: v(352, 300), end: v(448, 300) }

  it('nudges the chevrons twice after selection, then holds still; beats while hovered', () => {
    expect(chevronOffset(NUDGE_MS / 4, false)).toBeCloseTo(4)
    expect(chevronOffset(NUDGE_MS / 2, false)).toBeCloseTo(0)
    expect(chevronOffset(NUDGE_MS + 300, false)).toBe(0)
    expect(chevronOffset(400, true)).toBeCloseTo(4)
  })

  it('draws the rotate handle and one chevron at each end', () => {
    const f = fakeCtx()
    render(f.ctx, { level: lvl, sol, selected: ['r'], zoom: 1, handles: { at, t: NUDGE_MS } })
    expect(f.events.filter((e) => e.name === 'arc' && e.args[0] === 400 && e.args[1] === 268 && e.args[2] === 6)).toHaveLength(1)
    // chevron tips sit 3 units past each handle once the nudge is over
    const tips = f.events.filter((e) => e.name === 'lineTo' && e.props.strokeStyle === '#7fffd4' && e.props.lineWidth === 1.4).map((e) => e.args)
    expect(tips.some(([x, y]) => x === 451 && y === 300)).toBe(true)
    expect(tips.some(([x, y]) => x === 349 && y === 300)).toBe(true)
  })

  it('draws a notch dial instead of the handles while rotating, current notch in yellow', () => {
    const f = fakeCtx()
    render(f.ctx, { level: lvl, sol, selected: ['r'], zoom: 1, handles: { at, t: 0 }, dial: { center: v(400, 300), radius: 60, step: Math.PI / 2, current: Math.PI / 2, needle: 1.2, offset: -Math.PI / 2 } })
    const labels = f.events.filter((e) => e.name === 'fillText').map((e) => [e.args[0], e.props.fillStyle])
    expect(labels).toEqual([['0°', '#7fb4e8'], ['90°', '#ffcf5a'], ['180°', '#7fb4e8'], ['270°', '#7fb4e8']])
    expect(f.events.some((e) => e.name === 'arc' && e.args[2] === 6)).toBe(false)
  })
})
