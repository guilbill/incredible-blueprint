import { afterEach, describe, expect, it, vi } from 'vitest'
import { createImpactTracker, createThrottle, impulseVolume, loadMuted, MUTE_KEY, saveMuted } from '../../src/ui/soundLogic'

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

describe('impulseVolume', () => {
  it('is silent at or below the threshold and grows up to 1', () => {
    expect(impulseVolume(20)).toBe(0)
    expect(impulseVolume(5)).toBe(0)
    expect(impulseVolume(NaN)).toBe(0)
    expect(impulseVolume(21)).toBeGreaterThan(0)
    expect(impulseVolume(200)).toBeGreaterThan(impulseVolume(50))
    expect(impulseVolume(600)).toBeCloseTo(1)
    expect(impulseVolume(1e6)).toBeCloseTo(1)
  })
})

describe('createThrottle', () => {
  it('lets at most 12 through per second', () => {
    const ok = createThrottle(12)
    let n = 0
    for (let t = 0; t < 1000; t += 5) if (ok(t)) n++
    expect(n).toBeLessThanOrEqual(12)
    expect(n).toBeGreaterThanOrEqual(11)
    expect(ok(2000)).toBe(true)
    expect(ok(2010)).toBe(false)
  })
})

describe('createImpactTracker', () => {
  it('reports a pair only when it first crosses the threshold', () => {
    const track = createImpactTracker(20)
    expect(track([{ key: 'a', impulse: 100 }])).toBe(100)
    expect(track([{ key: 'a', impulse: 90 }])).toBe(0)
    expect(track([{ key: 'a', impulse: 5 }])).toBe(0)
    expect(track([{ key: 'a', impulse: 80 }])).toBe(80)
    expect(track([{ key: 'a', impulse: 30 }, { key: 'b', impulse: 50 }])).toBe(50)
  })
})

describe('mute persistence', () => {
  it('defaults to unmuted and round-trips through tim.mute', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(loadMuted()).toBe(false)
    saveMuted(true)
    expect(localStorage.getItem(MUTE_KEY)).toBe('true')
    expect(loadMuted()).toBe(true)
    saveMuted(false)
    expect(loadMuted()).toBe(false)
  })
  it('survives a broken storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } })
    expect(loadMuted()).toBe(false)
    expect(() => saveMuted(true)).not.toThrow()
  })
})
