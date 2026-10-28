import { describe, expect, it } from 'vitest'
import { validateLevel } from '../../src/level/codec'
import type { Placement } from '../../src/level/types'
import { EditorModel, blankLevel } from '../../src/editor/model'
import { rectFromDrag } from '../../src/ui/geometry'

const P = (id: string, kind: Placement['kind'], x: number, y: number, extra: Partial<Placement> = {}): Placement =>
  ({ id, kind, x, y, rot: 0, flip: false, settings: {}, ...extra })

const zoneGoal = { type: 'inZone' as const, part: 'ball', zone: { x: 600, y: 600, w: 100, h: 100 } }

/** A model with a ball and a goal, ready to be tested. */
function ready(): EditorModel {
  const m = new EditorModel(blankLevel('niveau-1'))
  expect(m.addFixed(P('ball', 'ball-base', 200, 100))).toBe(true)
  m.addGoal(zoneGoal)
  return m
}

describe('EditorModel', () => {
  it('a fresh model is valid, unverified and cannot share', () => {
    const m = new EditorModel(blankLevel('niveau-1'))
    expect(validateLevel(m.level)).toBeNull()
    expect(m.level.verified).toBe(false)
    expect(m.canShare).toBe(false)
  })

  it('winning a test makes it shareable and keeps the winning solution', () => {
    const m = ready()
    const sol = { placements: [P('p9', 'ramp', 300, 300)], links: [] }
    m.onTestWin(sol)
    expect(m.level.verified).toBe(true)
    expect(m.canShare).toBe(true)
    expect(m.solution).toEqual(sol)
  })

  it.each<[string, (m: EditorModel) => unknown]>([
    ['addFixed', (m) => m.addFixed(P('w', 'wall-brick', 600, 400))],
    ['moveFixed', (m) => m.moveFixed('ball', 300, 100)],
    ['removeFixed', (m) => m.removeFixed('ball')],
    ['setFixed', (m) => m.setFixed([...m.level.fixed], [])],
    ['setInventory', (m) => m.setInventory('ramp', 2)],
    ['addGoal', (m) => m.addGoal({ type: 'event', event: 'rope-cut' })],
    ['removeGoal', (m) => m.removeGoal(0)],
    ['setTitle', (m) => m.setTitle('Nouveau titre')],
    ['setGoalText', (m) => m.setGoalText('Faites ceci')],
    ['markDirty', (m) => m.markDirty()],
  ])('%s after a win makes it unshareable again', (_, edit) => {
    const m = ready()
    m.onTestWin({ placements: [], links: [] })
    edit(m)
    expect(m.level.verified).toBe(false)
    expect(m.canShare).toBe(false)
    expect(m.solution).toBeUndefined()
  })

  it('addFixed refuses overlaps, out of field parts and taken ids (canPlace)', () => {
    const m = ready()
    expect(m.addFixed(P('b2', 'ball-base', 200, 100))).toBe(false)
    expect(m.addFixed(P('b3', 'ball-base', -50, 100))).toBe(false)
    expect(m.addFixed(P('ball', 'ball-base', 600, 100))).toBe(false)
    expect(m.level.fixed.map((p) => p.id)).toEqual(['ball'])
  })

  it('moveFixed snaps to the grid and refuses overlaps', () => {
    const m = ready()
    expect(m.addFixed(P('w', 'wall-brick', 600, 400))).toBe(true)
    expect(m.moveFixed('ball', 304, 98)).toBe(true)
    expect(m.level.fixed.find((p) => p.id === 'ball')).toMatchObject({ x: 300, y: 100 })
    expect(m.moveFixed('ball', 600, 400)).toBe(false)
    expect(m.moveFixed('nope', 100, 100)).toBe(false)
  })

  it('removing a part drops its links and the goals aiming at it, so the level stays valid', () => {
    const m = ready()
    m.addGoal({ type: 'event', event: 'rope-cut', part: 'ball' })
    m.addGoal({ type: 'event', event: 'cheese-eaten' })
    m.removeFixed('ball')
    expect(m.level.goals).toEqual([{ type: 'event', event: 'cheese-eaten' }])
    expect(validateLevel(m.level)).toBeNull()
  })

  it('setInventory adds, updates and removes (count 0) kinds, in registry order', () => {
    const m = ready()
    m.setInventory('trampoline', 1)
    m.setInventory('ramp', 3)
    m.setInventory('ramp', 2)
    expect(m.level.inventory).toEqual([{ kind: 'ramp', count: 2 }, { kind: 'trampoline', count: 1 }])
    m.setInventory('ramp', 0)
    expect(m.level.inventory).toEqual([{ kind: 'trampoline', count: 1 }])
    m.setInventory('trampoline', -3)
    expect(m.level.inventory).toEqual([])
  })

  it('cannot test (nor share) without a goal: an empty goal list is met at once', () => {
    const m = new EditorModel(blankLevel('niveau-1'))
    expect(m.canTest).toBe(false)
    m.onTestWin({ placements: [], links: [] })
    expect(m.canShare).toBe(false)
    expect(ready().canTest).toBe(true)
  })

  it('does not share state with the level it was built from', () => {
    const src = blankLevel('niveau-1')
    const m = new EditorModel(src)
    m.setTitle('Autre')
    m.addFixed(P('ball', 'ball-base', 200, 100))
    expect(src.title).not.toBe('Autre')
    expect(src.fixed).toEqual([])
  })
})

describe('rectFromDrag', () => {
  it('snaps, orders the corners and clamps to the field', () => {
    expect(rectFromDrag({ x: 304, y: 196 }, { x: 102, y: 401 })).toEqual({ x: 100, y: 200, w: 200, h: 200 })
    expect(rectFromDrag({ x: -40, y: 790 }, { x: 60, y: 900 })).toEqual({ x: 0, y: 790, w: 60, h: 10 })
  })

  it('refuses a zone thinner than a grid step', () => {
    expect(rectFromDrag({ x: 100, y: 100 }, { x: 103, y: 300 })).toBeNull()
  })
})

describe('goals always aim at existing parts', () => {
  it('addGoal refuses a goal on a missing part and accepts parts, links and part-less events', () => {
    const m = ready()
    expect(m.addGoal({ ...zoneGoal, part: 'ghost' })).toBe(false)
    expect(m.addGoal({ type: 'event', event: 'rope-cut', part: 'ghost' })).toBe(false)
    expect(m.addGoal({ type: 'event', event: 'rope-cut' })).toBe(true)
    expect(m.addGoal({ type: 'event', event: 'rope-cut', part: 'ball' })).toBe(true)
    expect(validateLevel(m.level)).toBeNull()
  })

  it('a zone traced for a part removed meanwhile is refused and the level stays valid', () => {
    const m = ready()
    m.addFixed(P('w', 'wall-brick', 600, 400))
    const traced = 'w'
    m.setFixed(m.level.fixed.filter((p) => p.id !== traced), m.level.fixedLinks)
    expect(m.addGoal({ type: 'inZone', part: traced, zone: { x: 0, y: 0, w: 50, h: 50 }, hold: 30 })).toBe(false)
    m.removeFixed('ball')
    expect(m.addGoal(zoneGoal)).toBe(false)
    expect(m.level.goals).toEqual([])
    expect(validateLevel(m.level)).toBeNull()
  })

  it('a refused goal does not clear verification', () => {
    const m = ready()
    m.onTestWin({ placements: [], links: [] })
    expect(m.addGoal({ ...zoneGoal, part: 'ghost' })).toBe(false)
    expect(m.canShare).toBe(true)
  })
})
