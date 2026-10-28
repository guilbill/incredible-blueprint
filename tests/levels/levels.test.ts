import { describe, expect, it } from 'vitest'
import { runUntilGoal } from '../../src/game/simulation'
import { validateLevel } from '../../src/level/codec'
import { canPlace, snap } from '../../src/level/placement'
import type { Level, Solution } from '../../src/level/types'
import { canLink } from '../../src/parts/mech/links'
import { remaining } from '../../src/ui/edit'
import { loadLevels } from '../../src/ui/levels'

interface Reference { solution: Solution; step: number; hash: string }

const refs = import.meta.glob<Reference>('../../levels/*.solution.json', { eager: true, import: 'default' })
const refOf = (l: Level): Reference | undefined => refs[`../../levels/${l.id}.solution.json`]

/** 60 s at 120 steps per second. */
const MINUTE = 120 * 60

const levels = loadLevels()

describe('the 10 shipped levels', () => {
  it('ships levels 01 to 10 in order, each with a reference solution', () => {
    expect(levels.map((l) => l.id.slice(0, 2))).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'])
    for (const l of levels) expect(refOf(l), l.id).toBeDefined()
  })

  describe.each(levels.map((l) => [l.id, l] as const))('%s', (_id, level) => {
    const ref = refOf(level)!

    it('is a valid level whose fixed parts can be placed', () => {
      expect(validateLevel(level)).toBeNull()
      for (const p of level.fixed) expect(canPlace(p, level.fixed), p.id).toBe(true)
    })

    it('has a solution a player can build: inventory, snapped, placeable, linkable', () => {
      const { placements, links } = ref.solution
      for (const [kind, left] of remaining(level, ref.solution)) expect(left, kind).toBeGreaterThanOrEqual(0)
      const kinds = new Set(level.inventory.map((i) => i.kind))
      const all = [...level.fixed, ...placements]
      for (const p of placements) {
        expect(kinds.has(p.kind), p.id).toBe(true)
        expect([snap(p.x), snap(p.y)], p.id).toEqual([p.x, p.y])
        expect(canPlace(p, all), p.id).toBe(true)
      }
      expect(new Set(all.map((p) => p.id)).size).toBe(all.length)
      for (const l of links) expect(canLink(l.a, l.b, all), l.id).toBe(true)
    })

    it('is solved by its reference solution at the stored step, with the stored hash', () => {
      expect(runUntilGoal(level, ref.solution)).toEqual({ met: true, step: ref.step, hash: ref.hash })
    })

    it('is not solved within 60 s without the player’s parts', () => {
      expect(runUntilGoal(level, { placements: [], links: [] }, MINUTE).met).toBe(false)
    })
  })
})
