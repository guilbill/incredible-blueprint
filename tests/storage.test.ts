import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteCustomLevel, loadCustomLevels, saveCustomLevel } from '../src/level/custom'
import type { Level } from '../src/level/types'
import { LEVELS_KEY, forgetLevel, loadProgress, markSolved, saveDraft, storage } from '../src/storage'

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

afterEach(() => { vi.unstubAllGlobals() })

describe('storage', () => {
  it('returns false and the fallback when localStorage throws, without throwing (Review Focus 5)', () => {
    const broken = memoryStorage()
    broken.setItem = () => { throw new Error('QuotaExceededError') }
    broken.getItem = () => { throw new Error('SecurityError') }
    vi.stubGlobal('localStorage', broken)
    expect(() => storage.set('tim.progress', { solved: ['a'] })).not.toThrow()
    expect(storage.set('tim.progress', { solved: ['a'] })).toBe(false)
    expect(storage.get('tim.progress', 'fallback')).toBe('fallback')
  })

  it('survives localStorage being entirely unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(storage.set('k', 1)).toBe(false)
    expect(storage.get('k', 7)).toBe(7)
    expect(() => markSolved('lvl')).not.toThrow()
    expect(loadProgress()).toEqual({ solved: [], drafts: {} })
  })

  it('round-trips JSON and returns the fallback for corrupt data', () => {
    const mem = memoryStorage()
    vi.stubGlobal('localStorage', mem)
    expect(storage.set('k', { a: [1, 2] })).toBe(true)
    expect(storage.get('k', null)).toEqual({ a: [1, 2] })
    mem.setItem('bad', '{not json')
    expect(storage.get('bad', 'fb')).toBe('fb')
    expect(storage.get('missing', 'fb')).toBe('fb')
  })

  it('keeps progress: solved ids are unique and drafts are per level', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    markSolved('a')
    markSolved('a')
    saveDraft('a', { placements: [], links: [] })
    expect(loadProgress()).toEqual({ solved: ['a'], drafts: { a: { placements: [], links: [] } } })
  })

  it('normalises a malformed progress object', () => {
    const mem = memoryStorage()
    vi.stubGlobal('localStorage', mem)
    mem.setItem('tim.progress', JSON.stringify({ solved: 'oops' }))
    expect(loadProgress()).toEqual({ solved: [], drafts: {} })
  })

  it('forgetLevel drops one level’s solved mark and draft, and keeps the others', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    const sol = { placements: [], links: [] }
    markSolved('a')
    markSolved('b')
    saveDraft('a', sol)
    saveDraft('b', sol)
    expect(forgetLevel('a')).toBe(true)
    expect(loadProgress()).toEqual({ solved: ['b'], drafts: { b: sol } })
  })
})

describe('custom levels', () => {
  const lvl = (id: string): Level => ({ v: 1, id, title: id, goalText: '', fixed: [], fixedLinks: [], inventory: [], goals: [] })

  it('deleteCustomLevel removes the level and its progress, and keeps the others', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    saveCustomLevel(lvl('mine-1'))
    saveCustomLevel(lvl('mine-2'))
    markSolved('mine-1')
    saveDraft('mine-1', { placements: [], links: [] })
    markSolved('01-premier-plan')
    expect(deleteCustomLevel('mine-1')).toBe(true)
    expect(loadCustomLevels().map((l) => l.id)).toEqual(['mine-2'])
    expect(loadProgress()).toEqual({ solved: ['01-premier-plan'], drafts: {} })
  })

  it('deleteCustomLevel keeps stored entries it cannot read', () => {
    const mem = memoryStorage()
    vi.stubGlobal('localStorage', mem)
    mem.setItem(LEVELS_KEY, JSON.stringify([lvl('mine-1'), { id: 'future', v: 2 }, 'junk']))
    deleteCustomLevel('mine-1')
    expect(JSON.parse(mem.getItem(LEVELS_KEY)!)).toEqual([{ id: 'future', v: 2 }, 'junk'])
  })

  it('deleteCustomLevel reports failure when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(deleteCustomLevel('x')).toBe(false)
  })
})
