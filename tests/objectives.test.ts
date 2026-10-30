import { afterEach, describe, expect, it } from 'vitest'
import { setLang } from '../src/i18n'
import type { Goal, Level, Placement } from '../src/level/types'
import { objectiveText } from '../src/objectives'

const P = (id: string, kind: Placement['kind'], x: number, y: number): Placement => ({ id, kind, x, y, rot: 0, flip: false, settings: {} })
const inZone = (part: string, x: number, y: number): Goal => ({ type: 'inZone', part, zone: { x: x - 16, y: y - 16, w: 32, h: 32 } })
const level = (fixed: Placement[], goals: Goal[]): Pick<Level, 'fixed' | 'goals'> => ({ fixed, goals })

describe('objectiveText', () => {
  afterEach(() => setLang('fr'))

  it('names the bucket the zone sits in', () => {
    expect(objectiveText(level([P('ball', 'ball-base', 100, 100), P('b', 'bucket', 600, 600)], [inZone('ball', 600, 600)]))).toBe('Amenez la bille d’acier dans le seau.')
  })

  it('falls back to the marked zone when nothing holds it', () => {
    expect(objectiveText(level([P('ball', 'ball-tennis', 100, 100)], [inZone('ball', 600, 600)]))).toBe('Amenez la balle de tennis dans la zone marquée.')
  })

  it('tells two buckets apart by their side', () => {
    const fixed = [P('a', 'ball-basket', 0, 0), P('b', 'ball-tennis', 0, 0), P('l', 'bucket', 300, 600), P('r', 'bucket', 900, 600)]
    expect(objectiveText(level(fixed, [inZone('a', 900, 600), inZone('b', 300, 600)])))
      .toBe('Amenez le ballon de basket dans le seau de droite. Amenez la balle de tennis dans le seau de gauche.')
  })

  it('writes events and does not repeat a sentence', () => {
    const g: Goal = { type: 'event', event: 'cheese-eaten', part: 'cheese' }
    expect(objectiveText(level([], [g, g]))).toBe('Faites manger le fromage à la souris.')
  })

  it('speaks English', () => {
    setLang('en')
    const fixed = [P('ball', 'ball-base', 0, 0), P('l', 'bucket', 300, 300), P('r', 'bucket', 300, 700)]
    expect(objectiveText(level(fixed, [inZone('ball', 300, 700)]))).toBe('Get the steel ball into the bottom bucket.')
  })
})
