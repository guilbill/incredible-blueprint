import { describe, expect, it } from 'vitest'
import { getClip, setClip } from '../../src/ui/clipboard'
import type { Clip } from '../../src/ui/selection'

const clip = (): Clip => ({
  placements: [{ id: 'p1', kind: 'ramp', x: 100, y: 100, rot: 0, flip: false, settings: { length: 80 } }],
  links: [{ id: 'l1', kind: 'rope', a: { part: 'p1', anchor: 'center' }, b: { part: 'p2', anchor: 'center' } }],
})

describe('clipboard', () => {
  it('is empty at first', () => {
    expect(getClip()).toBeUndefined()
  })

  it('returns an equal clip', () => {
    setClip(clip())
    expect(getClip()).toEqual(clip())
  })

  it('is a deep copy both ways', () => {
    const c = clip()
    setClip(c)
    c.placements[0].settings.length = 1
    const got = getClip()!
    expect(got.placements[0].settings.length).toBe(80)
    got.placements[0].x = 5
    got.links[0].a.part = 'zz'
    expect(getClip()).toEqual(clip())
  })
})
