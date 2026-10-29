import { describe, expect, it } from 'vitest'
import { runUntilGoal } from '../../src/game/simulation'
import { validateLevel } from '../../src/level/codec'
import { canPlace, snap } from '../../src/level/placement'
import type { Level, PartKind, Solution } from '../../src/level/types'
import { canLink } from '../../src/parts/mech/links'
import { remaining } from '../../src/ui/edit'
import { loadLevels } from '../../src/ui/levels'

interface Reference { solution: Solution; step: number; hash: string }

const refs = import.meta.glob<Reference>('../../levels/*.solution.json', { eager: true, import: 'default' })
const refOf = (l: Level): Reference | undefined => refs[`../../levels/${l.id}.solution.json`]

/** 60 s at 120 steps per second. */
const MINUTE = 120 * 60

const GEARS: PartKind[] = ['gear-small', 'gear-large']
const NUDGES = [[-10, 0], [10, 0], [0, -10], [0, 10]] as const

const levels = loadLevels()

describe('the shipped levels', () => {
  it('ships levels numbered 01 upward with no gap, each with a reference solution', () => {
    expect(levels.length).toBeGreaterThanOrEqual(10)
    expect(levels.map((l) => l.id.slice(0, 2))).toEqual(levels.map((_, i) => String(i + 1).padStart(2, '0')))
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

    it('gives the same run whatever order the placements and links are listed in', () => {
      const { placements, links } = ref.solution
      // Deterministic shuffle: odd indexes first, then even ones (reversed, so it differs from a plain reverse).
      const shuffle = <T,>(xs: T[]): T[] => [...xs.filter((_, i) => i % 2 === 1), ...xs.filter((_, i) => i % 2 === 0).reverse()]
      for (const sol of [
        { placements: [...placements].reverse(), links: [...links].reverse() },
        { placements: shuffle(placements), links: shuffle(links) },
      ]) {
        expect(runUntilGoal(level, sol)).toEqual({ met: true, step: ref.step, hash: ref.hash })
      }
    })

    it('still wins with each player part nudged by one snap step (at least 2 of 4 neighbours)', () => {
      const { placements } = ref.solution
      const fragile: string[] = []
      placements.forEach((p, i) => {
        // A gear only turns its neighbour at the exact mesh distance (40 or 60, on the snap grid): moving it is meant to break the train.
        if (GEARS.includes(p.kind)) return
        let tried = 0
        let wins = 0
        for (const [dx, dy] of NUDGES) {
          const moved = { ...p, x: p.x + dx, y: p.y + dy }
          if (!canPlace(moved, [...level.fixed, ...placements.filter((_, j) => j !== i)])) continue
          tried++
          const sol = { ...ref.solution, placements: placements.map((q, j) => (j === i ? moved : q)) }
          if (runUntilGoal(level, sol, MINUTE).met) wins++
        }
        if (wins < Math.min(2, tried)) fragile.push(`${p.id} (${p.kind}): ${wins}/${tried}`)
      })
      expect(fragile).toEqual([])
    })

    it('is not solved within 60 s without the player’s parts', () => {
      expect(runUntilGoal(level, { placements: [], links: [] }, MINUTE).met).toBe(false)
    })
  })
})
