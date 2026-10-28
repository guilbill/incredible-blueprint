export type Vec = { x: number; y: number }

export const v = (x: number, y: number): Vec => ({ x, y })
export const add = (a: Vec, b: Vec): Vec => v(a.x + b.x, a.y + b.y)
export const sub = (a: Vec, b: Vec): Vec => v(a.x - b.x, a.y - b.y)
export const scale = (a: Vec, s: number): Vec => v(a.x * s, a.y * s)
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x
export const len = (a: Vec): number => Math.sqrt(a.x * a.x + a.y * a.y)

export function normalize(a: Vec): Vec {
  const l = len(a)
  return l === 0 ? v(0, 0) : v(a.x / l, a.y / l)
}

export function rotate(a: Vec, angle: number): Vec {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return v(a.x * c - a.y * s, a.x * s + a.y * c)
}

function onSegment(p: Vec, a: Vec, b: Vec): boolean {
  return (
    Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y)
  )
}

/** True when segments a1-a2 and b1-b2 cross or touch (collinear overlap included). */
export function segmentsIntersect(a1: Vec, a2: Vec, b1: Vec, b2: Vec): boolean {
  const d1 = cross(sub(b2, b1), sub(a1, b1))
  const d2 = cross(sub(b2, b1), sub(a2, b1))
  const d3 = cross(sub(a2, a1), sub(b1, a1))
  const d4 = cross(sub(a2, a1), sub(b2, a1))
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  return (
    (d1 === 0 && onSegment(a1, b1, b2)) ||
    (d2 === 0 && onSegment(a2, b1, b2)) ||
    (d3 === 0 && onSegment(b1, a1, a2)) ||
    (d4 === 0 && onSegment(b2, a1, a2))
  )
}

export function pointSegmentDistance(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  if (l2 === 0) return len(sub(p, a))
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2))
  return len(sub(p, add(a, scale(ab, t))))
}
