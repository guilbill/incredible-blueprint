import type { Body } from 'planck'
import { type Vec, add, rotate, v } from '../engine/vec'
import { bodyPose } from '../engine/world'
import type { Simulation } from '../game/simulation'
import { FIELD, anchorPoint, footprint } from '../level/placement'
import type { Anchor, Level, Link, Placement, Solution } from '../level/types'
import { CELL } from '../parts/common'
import { gearPhases } from '../parts/mech/gear'
import { partDef } from '../parts/registry'
import { COLORS, type PartDrawState, Pen } from './pen'

export interface RenderView {
  level: Level
  sol: Solution
  sim?: Simulation
  ghost?: PartDrawState
  /** Id of the selected player placement (yellow dashed outline). */
  selected?: string
  /** Goals met: goal zones glow yellow. */
  won?: boolean
  /** Edit mode: show every anchor (rope: ring, belt: square). */
  showAnchors?: boolean
  /** First anchor of a link being made (yellow). */
  pendingAnchor?: Anchor
  /** Id of the selected player link (yellow). */
  selectedLink?: string
  zoom: number
}

const TRAIL_LEN = 40
/** A trail is stroked in this many alpha bands (one path each) rather than one stroke per segment. */
export const TRAIL_BANDS = 4
const MIN_MOVE = 0.5
/** Trail buffers live here, not in the sim: one set per Simulation, dropped with it. */
const trails = new WeakMap<Simulation, Map<Body, Vec[]>>()

/** The grid never changes: it is drawn once per canvas size into an offscreen canvas, then copied. */
let gridCache: HTMLCanvasElement | undefined

function blitGrid(ctx: CanvasRenderingContext2D, zoom: number): boolean {
  if (typeof document === 'undefined') return false
  const w = Math.round(FIELD.w * zoom)
  const h = Math.round(FIELD.h * zoom)
  if (!gridCache || gridCache.width !== w || gridCache.height !== h) {
    gridCache = document.createElement('canvas')
    gridCache.width = w
    gridCache.height = h
    const g = gridCache.getContext('2d')
    if (!g) return false
    g.scale(zoom, zoom)
    drawGrid(g)
  }
  ctx.drawImage(gridCache, 0, 0)
  return true
}

function drawGrid(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, FIELD.w, FIELD.h)
  ctx.strokeStyle = COLORS.grid
  for (const major of [false, true]) {
    ctx.lineWidth = major ? 1 : 0.4
    ctx.beginPath()
    for (let x = 0; x <= FIELD.w; x += CELL) {
      if ((x / CELL) % 4 === 0 !== major) continue
      ctx.moveTo(x, 0)
      ctx.lineTo(x, FIELD.h)
    }
    for (let y = 0; y <= FIELD.h; y += CELL) {
      if ((y / CELL) % 4 === 0 !== major) continue
      ctx.moveTo(0, y)
      ctx.lineTo(FIELD.w, y)
    }
    ctx.stroke()
  }
}

function drawGoals(pen: Pen, level: Level, won: boolean): void {
  pen.reset(COLORS.yellow, won ? 3 : 1.5)
  if (won) pen.glow(1.5, 'yellow')
  pen.dashed(!won)
  for (const g of level.goals) {
    if (g.type !== 'inZone') continue
    const { x, y, w, h } = g.zone
    pen.poly([v(x, y), v(x + w, y), v(x + w, y + h), v(x, y + h)])
    if (won) {
      pen.ctx.globalAlpha = 0.18
      pen.ctx.fillRect(x, y, w, h)
      pen.ctx.globalAlpha = 1
    }
  }
  pen.reset()
}

function anchorPos(a: Anchor, placements: Placement[], sim?: Simulation): Vec | undefined {
  const inst = sim?.parts.find((p) => p.id === a.part)
  const anc = inst?.anchors[a.anchor]
  if (anc) {
    const pose = bodyPose(anc.body)
    return add(v(pose.x, pose.y), rotate(anc.local, pose.angle))
  }
  const p = placements.find((q) => q.id === a.part)
  const def = p && partDef(p.kind).anchors.find((d) => d.key === a.anchor)
  return p && def ? anchorPoint(p, def) : undefined
}

function drawLinks(pen: Pen, links: Link[], placements: Placement[], sim?: Simulation, selected?: string): void {
  for (const l of links) {
    // A cut rope disappears, and so does one tied to a part taken out of play (an eaten cheese, a
    // caught mouse): Planck no longer simulates it. A link the simulation could not build is not drawn while it runs.
    if (sim && l.kind === 'rope') {
      const r = sim.ropeOf.get(l.id)
      if (r?.enabled !== true || !r.joint.getBodyA().isActive() || !r.joint.getBodyB().isActive()) continue
    }
    const a = anchorPos(l.a, placements, sim)
    const b = anchorPos(l.b, placements, sim)
    if (!a || !b) continue
    if (l.id === selected) pen.reset(COLORS.yellow, 2)
    else pen.reset(COLORS.line, 1)
    pen.dashed(l.kind === 'belt')
    pen.line(a, b)
  }
  pen.reset()
}

function drawAnchors(pen: Pen, placements: Placement[], pending?: Anchor): void {
  for (const p of placements) {
    for (const d of partDef(p.kind).anchors) {
      const at = anchorPoint(p, d)
      const on = pending?.part === p.id && pending.anchor === d.key
      pen.reset(on ? COLORS.yellow : COLORS.cyan, on ? 2 : 1)
      if (on) pen.glow(1, 'yellow')
      if (d.role === 'rope') pen.circle(at, 4)
      else pen.poly([v(at.x - 4, at.y - 4), v(at.x + 4, at.y - 4), v(at.x + 4, at.y + 4), v(at.x - 4, at.y + 4)])
    }
  }
  pen.reset()
}

/** Small hatched mark in the first footprint corner, to show the part is locked. */
function drawLockMark(pen: Pen, p: Placement): void {
  const [c, e1, , e2] = footprint(p)
  const size = 8
  const toward = (to: Vec): Vec => {
    const dx = to.x - c.x
    const dy = to.y - c.y
    const l = Math.sqrt(dx * dx + dy * dy) || 1
    return v((dx / l) * size, (dy / l) * size)
  }
  const a = toward(e1)
  const b = toward(e2)
  pen.reset(COLORS.note, 1)
  for (let i = 1; i <= 3; i++) {
    const t = i / 3
    pen.line(add(c, v(a.x * t, a.y * t)), add(c, v(b.x * t, b.y * t)))
  }
}

/** `fig` is the part's FIG. number, or null to leave the label out (while the machine runs). */
function drawPart(pen: Pen, s: PartDrawState, fig: number | null): void {
  const def = partDef(s.placement.kind)
  const ctx = pen.ctx
  ctx.save()
  if (s.ghost) ctx.globalAlpha = 0.5
  def.draw?.(pen, s)
  ctx.restore()
  pen.reset()
  if (s.ghost) {
    pen.reset(s.ghost === 'ok' ? COLORS.cyan : '#ff6b6b', 1)
    pen.dashed(true)
    pen.poly(footprint(s.placement))
    pen.dashed(false)
  } else if (s.selected) {
    pen.reset(COLORS.yellow, 1)
    pen.dashed(true)
    pen.poly(footprint(s.placement))
    pen.dashed(false)
  }
  const top = footprint(s.placement).reduce((m, p) => (p.y < m.y ? p : m))
  if (fig !== null) pen.label(`FIG. ${fig} · ${def.label.toUpperCase()}`, v(top.x + 4, top.y - 4))
  if (s.fixed) drawLockMark(pen, s.placement)
}

function tracePath(ctx: CanvasRenderingContext2D, pts: Vec[], from: number, to: number): void {
  ctx.beginPath()
  ctx.moveTo(pts[from].x, pts[from].y)
  for (let i = from + 1; i <= to; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.stroke()
}

function drawTrails(pen: Pen, sim: Simulation): void {
  let map = trails.get(sim)
  if (!map) trails.set(sim, (map = new Map()))
  const ctx = pen.ctx
  for (const inst of sim.parts) {
    for (const b of inst.bodies) {
      if (!b.isDynamic()) continue
      const { x, y } = bodyPose(b)
      let t = map.get(b)
      if (!t) map.set(b, (t = []))
      const last = t[t.length - 1]
      if (!last || Math.abs(x - last.x) + Math.abs(y - last.y) > MIN_MOVE) {
        t.push(v(x, y))
        if (t.length > TRAIL_LEN) t.shift()
      }
      if (t.length < 2) continue
      // No shadowBlur here: blurring every segment of every trail was the costliest part of a frame.
      // A wide faint stroke gives the glow, then the trail fades in a few alpha bands.
      ctx.strokeStyle = COLORS.cyan
      ctx.globalAlpha = 0.12
      ctx.lineWidth = 6
      tracePath(ctx, t, 0, t.length - 1)
      ctx.lineWidth = 2
      const n = t.length - 1
      for (let k = 0; k < TRAIL_BANDS; k++) {
        const from = Math.floor((k * n) / TRAIL_BANDS)
        const to = Math.floor(((k + 1) * n) / TRAIL_BANDS)
        if (to <= from) continue
        ctx.globalAlpha = (k + 1) / TRAIL_BANDS
        tracePath(ctx, t, from, to)
      }
      ctx.globalAlpha = 1
    }
  }
  pen.reset()
}

export function render(ctx: CanvasRenderingContext2D, view: RenderView): void {
  const { level, sol, sim } = view
  const pen = new Pen(ctx)
  ctx.save()
  const cached = blitGrid(ctx, view.zoom)
  ctx.scale(view.zoom, view.zoom)
  if (!cached) drawGrid(ctx)
  drawGoals(pen, level, view.won ?? false)
  const placements = [...level.fixed, ...sol.placements]
  drawLinks(pen, [...level.fixedLinks, ...sol.links], placements, sim, view.selectedLink)
  const fixedIds = new Set(level.fixed.map((p) => p.id))
  const phases = gearPhases(placements)
  placements.forEach((placement, i) => {
    const inst = sim?.parts.find((p) => p.id === placement.id)
    drawPart(pen, { placement, inst, fixed: fixedIds.has(placement.id), selected: placement.id === view.selected, phase: phases.get(placement.id) }, sim ? null : i + 1)
  })
  if (sim) drawTrails(pen, sim)
  if (!sim && view.showAnchors) drawAnchors(pen, placements, view.pendingAnchor)
  if (view.ghost) {
    const g = view.ghost
    const ghostPhases = gearPhases([...placements, g.placement])
    drawPart(pen, { ...g, phase: ghostPhases.get(g.placement.id) }, placements.length + 1)
  }
  ctx.restore()
}
