import { afterEach, describe, expect, it, vi } from 'vitest'
import { activeLoops, createImpactTracker, createThrottle, impactVoice, impulseVolume, loadMuted, MUTE_KEY, saveMuted, startedParts } from '../../src/ui/soundLogic'

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
    expect(track([{ key: 'a', impulse: 100 }])?.impulse).toBe(100)
    expect(track([{ key: 'a', impulse: 90 }])).toBeUndefined()
    expect(track([{ key: 'a', impulse: 5 }])).toBeUndefined()
    expect(track([{ key: 'a', impulse: 80 }])?.impulse).toBe(80)
    expect(track([{ key: 'a', impulse: 30 }, { key: 'b', impulse: 50 }])?.key).toBe('b')
  })
})

describe('impact voices', () => {
  it('picks the trampoline, then the heaviest ball, then the wall, else a plain tick', () => {
    expect(impactVoice(['ball-tennis', 'trampoline'])).toBe('trampoline')
    expect(impactVoice(['ball-tennis', 'ball-bowling'])).toBe('ball-bowling')
    expect(impactVoice(['ball-base', 'wall-brick'])).toBe('ball-base')
    expect(impactVoice(['wall-wood', 'ramp'])).toBe('wall-wood')
    expect(impactVoice(['ramp', undefined])).toBe('tick')
  })
})

describe('loops and starts', () => {
  const P = (id: string, kind: Parameters<typeof activeLoops>[0] extends Iterable<infer T> ? T extends { kind: infer K } ? K : never : never, glow: number) => ({ id, kind, glow })

  it('plays one loop per kind of running part', () => {
    expect([...activeLoops([P('a', 'gear-small', 1), P('b', 'gear-large', 0.9), P('c', 'fan', 0.2), P('d', 'cat', 1)])]).toEqual(['gears'])
  })

  it('reports a part once when it starts, not every step it stays lit, and never a looping part', () => {
    const cat = P('c', 'cat', 1)
    expect(startedParts(new Map(), [cat, P('g', 'gear-small', 1)])).toEqual([cat])
    expect(startedParts(new Map([['c', 0.98]]), [cat])).toEqual([])
    expect(startedParts(new Map([['c', 0.3]]), [cat])).toEqual([cat])
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
