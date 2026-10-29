import type { Body } from 'planck'
import { type Vec, add, rotate, v } from '../engine/vec'
import { bodyPose } from '../engine/world'
import type { Simulation } from '../game/simulation'
import { FIELD, anchorPoint, footprint } from '../level/placement'
import type { Anchor, Level, Link, Placement, Solution } from '../level/types'
import { CELL } from '../parts/common'
import { gearPhases } from '../parts/mech/gear'
import { partDef } from '../parts/registry'
import { BELT_GAP, beltLoop, traceBelt } from './belt'
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
  /** First anchor of a link being made (yellow). */
  pendingAnchor?: Anchor
  /** Link tool: anchors the link can end on, drawn as pulsing cyan dots. */
  targets?: Anchor[]
  /** Pulse phase 0..1 of the targets (see PULSE_MS). */
  pulse?: number
  /** Link being made: dashed yellow line from the first anchor to the cursor. */
  pendingLine?: { from: Vec; to: Vec }
  /** Hovered part and the milliseconds since the hover started (drives the FIG. label animation). */
  hover?: { id: string; t: number }
  /** Contact points of a dragged gear that meshes. */
  meshMarks?: Vec[]
  /** Id of the selected player link (yellow). */
  selectedLink?: string
  zoom: number
}

/** Hover label: the leader line draws in, then the text fades in. */
export const LABEL_LINE_MS = 220
export const LABEL_FADE_DELAY_MS = 160
export const LABEL_FADE_MS = 180
/** Period of the pulsing link targets. */
export const PULSE_MS = 1200

export function labelDone(t: number): boolean {
  return t >= LABEL_FADE_DELAY_MS + LABEL_FADE_MS
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

/** Radius and current angle of the wheel under a belt anchor (angle 0 before the run). */
function wheelOf(a: Anchor, placements: Placement[], sim?: Simulation): { radius: number; angle: number } | undefined {
  const anc = sim?.parts.find((p) => p.id === a.part)?.anchors[a.anchor]
  if (anc) return { radius: anc.radius, angle: bodyPose(anc.body).angle }
  const p = placements.find((q) => q.id === a.part)
  const radius = p && partDef(p.kind).anchors.find((d) => d.key === a.anchor)?.radius
  return radius === undefined ? undefined : { radius, angle: 0 }
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
    const wa = l.kind === 'belt' ? wheelOf(l.a, placements, sim) : undefined
    const wb = l.kind === 'belt' ? wheelOf(l.b, placements, sim) : undefined
    const loop = wa && wb ? beltLoop(a, wa.radius + BELT_GAP, b, wb.radius + BELT_GAP) : null
    if (loop && wa) {
      // Dashes run at belt speed: the first wheel's rim speed, in its turning direction.
      pen.ctx.setLineDash([8, 4])
      pen.ctx.lineDashOffset = -wa.angle * loop.ra
      traceBelt(pen.ctx, loop)
      pen.ctx.stroke()
      pen.ctx.lineDashOffset = 0
      continue
    }
    pen.dashed(l.kind === 'belt')
    pen.line(a, b)
  }
  pen.reset()
}

/** First anchor of a link being made: yellow ring, no glow. */
function drawPending(pen: Pen, at: Vec): void {
  pen.reset(COLORS.yellow, 2)
  pen.circle(at, 6)
  pen.ctx.beginPath()
  pen.ctx.arc(at.x, at.y, 2.5, 0, Math.PI * 2)
  pen.ctx.fill()
}

/** Anchors a link can end on: a cyan dot and a ring that grows and fades. */
function drawTargets(pen: Pen, targets: Vec[], pulse: number): void {
  const ctx = pen.ctx
  pen.reset(COLORS.cyan, 1.5)
  for (const at of targets) {
    ctx.beginPath()
    ctx.arc(at.x, at.y, 5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1 - pulse
  for (const at of targets) pen.circle(at, 5 + 13 * pulse)
  ctx.globalAlpha = 1
  pen.reset()
}

function drawMeshMarks(pen: Pen, marks: Vec[]): void {
  pen.reset(COLORS.cyan, 2)
  for (const at of marks) {
    pen.circle(at, 7)
    pen.ctx.beginPath()
    pen.ctx.arc(at.x, at.y, 2.5, 0, Math.PI * 2)
    pen.ctx.fill()
  }
  pen.reset()
}

const LABEL_CHAR_W = 5.4

/** FIG. n label with a leader line from the top-right corner of the part: diagonal, then horizontal. */
function drawHoverLabel(pen: Pen, p: Placement, fig: number, t: number): void {
  const text = `FIG. ${fig} · ${partDef(p.kind).label.toUpperCase()}`
  const w = text.length * LABEL_CHAR_W
  const c = footprint(p).reduce((m, q) => (q.x - q.y > m.x - m.y ? q : m))
  const down = c.y < 40
  const left = c.x + 30 + w > FIELD.w
  const dx = left ? -1 : 1
  const dy = down ? 1 : -1
  const knee = v(c.x + dx * 30, c.y + dy * 30)
  const end = v(knee.x + dx * w, knee.y)
  // Draw the polyline c -> knee -> end up to the given share of its length.
  const l1 = 30 * Math.SQRT2
  const total = l1 + w
  let reach = Math.min(1, t / LABEL_LINE_MS) * total
  pen.reset(COLORS.note, 1)
  const first = Math.min(reach, l1) / l1
  pen.line(c, v(c.x + (knee.x - c.x) * first, c.y + (knee.y - c.y) * first))
  reach -= l1
  if (reach > 0) pen.line(knee, v(knee.x + dx * reach, knee.y))
  const alpha = Math.max(0, Math.min(1, (t - LABEL_FADE_DELAY_MS) / LABEL_FADE_MS))
  if (alpha <= 0) return
  const x = Math.max(0, Math.min(FIELD.w - w, Math.min(knee.x, end.x)))
  const y = Math.max(0, Math.min(FIELD.h, down ? knee.y + 10 : knee.y - 3))
  pen.ctx.globalAlpha = alpha
  pen.label(text, v(x, y))
  pen.ctx.globalAlpha = 1
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

function drawPart(pen: Pen, s: PartDrawState): void {
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
  for (const placement of placements) {
    const inst = sim?.parts.find((p) => p.id === placement.id)
    drawPart(pen, { placement, inst, fixed: fixedIds.has(placement.id), selected: placement.id === view.selected, phase: phases.get(placement.id) })
  }
  if (sim) drawTrails(pen, sim)
  if (view.ghost) {
    const g = view.ghost
    const ghostPhases = gearPhases([...placements.filter((q) => q.id !== g.placement.id), g.placement])
    drawPart(pen, { ...g, phase: ghostPhases.get(g.placement.id) })
  }
  if (!sim) {
    if (view.pendingAnchor) {
      const at = anchorPos(view.pendingAnchor, placements)
      if (at) drawPending(pen, at)
    }
    if (view.targets && view.pulse !== undefined) {
      const ats = view.targets.flatMap((a) => anchorPos(a, placements) ?? [])
      drawTargets(pen, ats, view.pulse)
    }
    if (view.pendingLine) {
      pen.reset(COLORS.yellow, 1.5)
      pen.dashed(true)
      pen.line(view.pendingLine.from, view.pendingLine.to)
      pen.reset()
    }
    if (view.meshMarks) drawMeshMarks(pen, view.meshMarks)
    if (view.hover) {
      const i = placements.findIndex((q) => q.id === view.hover?.id)
      if (i >= 0) drawHoverLabel(pen, placements[i], i + 1, view.hover.t)
    }
  }
  ctx.restore()
}
