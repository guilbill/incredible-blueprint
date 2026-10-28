import type { Vec } from '../engine/vec'
import { FIELD, SNAP, snap } from '../level/placement'

export interface CanvasFit {
  /** CSS pixels of the canvas element. */
  cssW: number
  cssH: number
  /** Backing-store pixels (css × devicePixelRatio). */
  pxW: number
  pxH: number
  /** Scale passed to render(): units → backing pixels. */
  zoom: number
}

interface Rect { left: number; top: number; width: number; height: number }

/** Largest canvas with the field's aspect ratio that fits in the available box. */
export function fitCanvas(availW: number, availH: number, dpr: number): CanvasFit {
  const scale = Math.max(0.1, Math.min(availW / FIELD.w, availH / FIELD.h))
  const cssW = Math.floor(FIELD.w * scale)
  const cssH = Math.floor(FIELD.h * scale)
  const ratio = dpr > 0 && Number.isFinite(dpr) ? dpr : 1
  const pxW = Math.round(cssW * ratio)
  return { cssW, cssH, pxW, pxH: Math.round(cssH * ratio), zoom: pxW / FIELD.w }
}

/** Client (mouse) coordinates to field units, given the canvas bounding rect. */
export function clientToUnits(clientX: number, clientY: number, rect: Rect): Vec {
  return {
    x: ((clientX - rect.left) / rect.width) * FIELD.w,
    y: ((clientY - rect.top) / rect.height) * FIELD.h,
  }
}

/** Field units to client coordinates (for DOM overlays such as the selection panel). */
export function unitsToClient(p: Vec, rect: Rect): Vec {
  return { x: rect.left + (p.x / FIELD.w) * rect.width, y: rect.top + (p.y / FIELD.h) * rect.height }
}

export const insideField = (p: Vec): boolean => p.x >= 0 && p.y >= 0 && p.x <= FIELD.w && p.y <= FIELD.h

/**
 * Where to put the selection panel, in stage-local pixels: just right of the part's top-right
 * corner (`anchor`, client coordinates), clamped inside the stage with a margin.
 */
export function panelPosition(anchor: Vec, stage: Rect, panel: { w: number; h: number }, gap = 10, margin = 8): Vec {
  const maxX = stage.width - panel.w - margin
  const maxY = stage.height - panel.h - margin
  return {
    x: Math.max(margin, Math.min(anchor.x - stage.left + gap, maxX)),
    y: Math.max(margin, Math.min(anchor.y - stage.top, maxY)),
  }
}

/**
 * Rectangle traced by dragging from `a` to `b` (units), in any direction: corners snapped to the
 * grid and clamped to the field. Null when it is thinner than one grid step.
 */
export function rectFromDrag(a: Vec, b: Vec): { x: number; y: number; w: number; h: number } | null {
  const cx = (x: number) => Math.min(FIELD.w, Math.max(0, snap(x)))
  const cy = (y: number) => Math.min(FIELD.h, Math.max(0, snap(y)))
  const x0 = Math.min(cx(a.x), cx(b.x))
  const x1 = Math.max(cx(a.x), cx(b.x))
  const y0 = Math.min(cy(a.y), cy(b.y))
  const y1 = Math.max(cy(a.y), cy(b.y))
  if (x1 - x0 < SNAP || y1 - y0 < SNAP) return null
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
