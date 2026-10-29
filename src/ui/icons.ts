const NS = 'http://www.w3.org/2000/svg'

export type IconName = 'duplicate' | 'copy' | 'rotate' | 'flip' | 'lock' | 'unlock' | 'delete'

type Shape = [tag: string, attrs: Record<string, string | number>]

// 14x14 line drawings, stroked with the button's text colour
const SHAPES: Record<IconName, Shape[]> = {
  duplicate: [
    ['rect', { x: 1, y: 4, width: 8, height: 8 }],
    ['rect', { x: 5, y: 1, width: 8, height: 8 }],
  ],
  copy: [
    ['rect', { x: 3, y: 2, width: 8, height: 10 }],
    ['line', { x1: 5, y1: 5, x2: 9, y2: 5 }],
    ['line', { x1: 5, y1: 8, x2: 9, y2: 8 }],
  ],
  rotate: [
    ['path', { d: 'M11 7 a4 4 0 1 1 -1.2 -2.9' }],
    ['path', { d: 'M10 1 V4.5 H6.5' }],
  ],
  flip: [
    ['line', { x1: 7, y1: 1, x2: 7, y2: 13, 'stroke-dasharray': '2 2' }],
    ['path', { d: 'M5 3 L1 11 H5 Z M9 3 L13 11 H9 Z' }],
  ],
  lock: [
    ['rect', { x: 2, y: 6, width: 9, height: 7, rx: 1 }],
    ['path', { d: 'M4 6 V4 a2.5 2.5 0 0 1 5 0 V6' }],
  ],
  unlock: [
    ['rect', { x: 2, y: 6, width: 9, height: 7, rx: 1 }],
    ['path', { d: 'M4 6 V4 a2.5 2.5 0 0 1 5 0' }],
  ],
  delete: [['path', { d: 'M3 3 L11 11 M11 3 L3 11', 'stroke-width': 1.5 }]],
}

/** A 14x14 line icon that takes the colour of its button. */
export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  svg.setAttribute('viewBox', '0 0 14 14')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.2')
  svg.setAttribute('aria-hidden', 'true')
  for (const [tag, attrs] of SHAPES[name]) {
    const shape = document.createElementNS(NS, tag)
    for (const [k, val] of Object.entries(attrs)) shape.setAttribute(k, String(val))
    svg.append(shape)
  }
  return svg
}
