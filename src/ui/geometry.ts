import type { Vec } from '../engine/vec'
import { FIELD } from '../level/placement'

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
