import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadProgress, markSolved, saveDraft, storage } from '../src/storage'

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
})
