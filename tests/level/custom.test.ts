import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { duplicateLevel, insertCustomLevelAfter, loadCustomLevels, saveCustomLevel } from '../../src/level/custom'
import type { Level } from '../../src/level/types'
import { loadLevels } from '../../src/ui/levels'

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k) },
    setItem: (k, v) => { m.set(k, String(v)) },
  }
}

// A valid shipped level as the base, so stored copies pass validation.
const base = loadLevels()[0]
const level = (id: string, title = id): Level => ({ ...structuredClone(base), id, title, verified: true })

const ids = () => loadCustomLevels().map((l) => l.id)

describe('custom levels', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))
  afterEach(() => vi.unstubAllGlobals())

  it('saveCustomLevel keeps the order', () => {
    for (const id of ['a', 'b', 'c']) saveCustomLevel(level(id))
    saveCustomLevel(level('a', 'Renamed'))
    expect(ids()).toEqual(['a', 'b', 'c'])
    expect(loadCustomLevels()[0].title).toBe('Renamed')
  })

  it('insertCustomLevelAfter puts the copy right after its original', () => {
    for (const id of ['a', 'b', 'c']) saveCustomLevel(level(id))
    expect(insertCustomLevelAfter(level('copy'), 'a')).toBe(true)
    expect(ids()).toEqual(['a', 'copy', 'b', 'c'])
  })

  it('insertCustomLevelAfter refuses an unknown original', () => {
    saveCustomLevel(level('a'))
    expect(insertCustomLevelAfter(level('copy'), 'zzz')).toBe(false)
    expect(ids()).toEqual(['a'])
  })
})

describe('duplicateLevel', () => {
  it('gives a new id, a copy title and an unverified level', () => {
    const copy = duplicateLevel(level('a', 'Mon niveau'), 'b')
    expect(copy.id).toBe('b')
    expect(copy.title).toBe('Mon niveau (copie)')
    expect(copy.verified).toBe(false)
    expect(copy.fixed).toEqual(level('a').fixed)
  })

  it('does not share objects with the original', () => {
    const original = level('a')
    const copy = duplicateLevel(original, 'b')
    copy.fixed[0].x = 999
    copy.inventory[0].count = 9
    copy.goals.length = 0
    expect(original.fixed[0].x).toBe(base.fixed[0].x)
    expect(original.inventory[0].count).toBe(base.inventory[0].count)
    expect(original.goals).toHaveLength(base.goals.length)
  })

  it('copies a shipped level with its current-language text', () => {
    const shipped = loadLevels()[0]
    const copy = duplicateLevel(shipped, 'x')
    expect(copy.title).toBe(`${shipped.title} (copie)`)
  })
})
