import type { Placement, PartKind } from '../level/types'
import { footprint } from '../level/placement'
import { partDef } from '../parts/registry'
import { Pen } from '../render/pen'
import { el } from './dom'

/** Small line-art icon of a part for the drawer. */
export function partIcon(kind: PartKind): HTMLCanvasElement {
  const size = 44
  const dpr = window.devicePixelRatio || 1
  const c = el('canvas', 'icon')
  c.width = size * dpr
  c.height = size * dpr
  c.style.width = c.style.height = `${size}px`
  const ctx = c.getContext('2d')
  const def = partDef(kind)
  if (!ctx || !def.draw) return c
  const p: Placement = { id: 'icon', kind, x: 0, y: 0, rot: 0, flip: false, settings: {} }
  const fp = footprint(p)
  const w = Math.max(...fp.map((q) => q.x)) - Math.min(...fp.map((q) => q.x))
  const h = Math.max(...fp.map((q) => q.y)) - Math.min(...fp.map((q) => q.y))
  const s = Math.min(1.2, (size - 8) / Math.max(w, h))
  ctx.scale(dpr, dpr)
  ctx.translate(size / 2, size / 2)
  ctx.scale(s, s)
  def.draw(new Pen(ctx), { placement: p })
  return c
}
