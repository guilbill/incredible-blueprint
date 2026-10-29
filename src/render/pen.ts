import type { Vec } from '../engine/vec'
import type { Placement } from '../level/types'
import type { PartInstance } from '../parts/types'

export const COLORS = {
  bg: '#0e2a4a',
  grid: '#2a5585',
  line: '#cfe6ff',
  note: '#7fb4e8',
  cyan: '#7fffd4',
  yellow: '#ffcf5a',
} as const

export interface PartDrawState {
  placement: Placement
  inst?: PartInstance
  ghost?: 'ok' | 'bad'
  selected?: boolean
  /** Locked part of the level (the renderer adds a hatched corner mark). */
  fixed?: boolean
  /** Gears: drawing angle offset so meshing teeth interlock. */
  phase?: number
}

/** Blueprint drawing primitives over a 2D context; all coordinates are in game units. */
export class Pen {
  constructor(readonly ctx: CanvasRenderingContext2D) {}

  /** Resets stroke style to the line colour. Call before drawing a part. */
  reset(color: string = COLORS.line, width = 1.5): void {
    const c = this.ctx
    c.strokeStyle = color
    c.fillStyle = color
    c.lineWidth = width
    c.setLineDash([])
    c.shadowBlur = 0
    c.shadowColor = 'transparent'
  }

  line(a: Vec, b: Vec): void {
    const c = this.ctx
    c.beginPath()
    c.moveTo(a.x, a.y)
    c.lineTo(b.x, b.y)
    c.stroke()
  }

  circle(center: Vec, r: number): void {
    const c = this.ctx
    c.beginPath()
    c.arc(center.x, center.y, r, 0, Math.PI * 2)
    c.stroke()
  }

  /** Closed outline. */
  poly(pts: Vec[]): void {
    if (pts.length === 0) return
    const c = this.ctx
    c.beginPath()
    c.moveTo(pts[0].x, pts[0].y)
    for (const p of pts.slice(1)) c.lineTo(p.x, p.y)
    c.closePath()
    c.stroke()
  }

  /** Open polyline. */
  path(pts: Vec[]): void {
    if (pts.length === 0) return
    const c = this.ctx
    c.beginPath()
    c.moveTo(pts[0].x, pts[0].y)
    for (const p of pts.slice(1)) c.lineTo(p.x, p.y)
    c.stroke()
  }

  dashed(on: boolean): void {
    this.ctx.setLineDash(on ? [6, 4] : [])
  }

  /** intensity 0 clears the glow; otherwise shadowBlur is 12 * intensity and strokes take the glow colour. */
  glow(intensity: number, color: 'cyan' | 'yellow'): void {
    const c = this.ctx
    if (intensity <= 0) {
      c.shadowBlur = 0
      c.shadowColor = 'transparent'
      return
    }
    c.shadowBlur = 12 * intensity
    c.shadowColor = COLORS[color]
    c.strokeStyle = COLORS[color]
  }

  label(text: string, at: Vec): void {
    const c = this.ctx
    c.save()
    c.shadowBlur = 0
    c.fillStyle = COLORS.note
    c.font = '9px monospace'
    c.textBaseline = 'alphabetic'
    c.fillText(text, at.x, at.y)
    c.restore()
  }
}
