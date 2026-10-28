import { describe, expect, it } from 'vitest'
import { cross, len, normalize, pointSegmentDistance, rotate, segmentsIntersect, v } from '../src/engine/vec'

describe('vec', () => {
  it('basic ops', () => {
    expect(cross(v(1, 0), v(0, 1))).toBe(1)
    expect(len(v(3, 4))).toBe(5)
    expect(normalize(v(0, 0))).toEqual(v(0, 0))
    const r = rotate(v(1, 0), Math.PI / 2)
    expect(r.x).toBeCloseTo(0)
    expect(r.y).toBeCloseTo(1)
  })

  it('segmentsIntersect: crossing', () => {
    expect(segmentsIntersect(v(0, 0), v(2, 2), v(0, 2), v(2, 0))).toBe(true)
  })
  it('segmentsIntersect: parallel', () => {
    expect(segmentsIntersect(v(0, 0), v(2, 0), v(0, 1), v(2, 1))).toBe(false)
  })
  it('segmentsIntersect: touching', () => {
    expect(segmentsIntersect(v(0, 0), v(1, 1), v(1, 1), v(2, 0))).toBe(true)
    expect(segmentsIntersect(v(0, 0), v(2, 0), v(1, 0), v(1, 2))).toBe(true)
  })
  it('segmentsIntersect: collinear disjoint', () => {
    expect(segmentsIntersect(v(0, 0), v(1, 0), v(2, 0), v(3, 0))).toBe(false)
  })

  it('pointSegmentDistance', () => {
    expect(pointSegmentDistance(v(1, 1), v(0, 0), v(2, 0))).toBe(1)
    expect(pointSegmentDistance(v(3, 0), v(0, 0), v(2, 0))).toBe(1)
  })
})
