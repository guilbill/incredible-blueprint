import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCKS_KEY, copyLocks, forgetLocks, loadLocks, pruneLocks, saveLocks } from '../../src/editor/locks'
import type { Placement } from '../../src/level/types'

const P = (id: string): Placement => ({ id, kind: 'ball-base', x: 100, y: 100, rot: 0, flip: false, settings: {} })

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

describe('locks', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))
  afterEach(() => vi.unstubAllGlobals())

  it('round-trips through storage', () => {
    saveLocks('a', new Set(['x', 'y']))
    expect([...loadLocks('a')].sort()).toEqual(['x', 'y'])
  })

  it('keeps levels apart', () => {
    saveLocks('a', new Set(['x']))
    saveLocks('b', new Set(['y']))
    expect([...loadLocks('a')]).toEqual(['x'])
    expect([...loadLocks('b')]).toEqual(['y'])
  })

  it('copies and forgets', () => {
    saveLocks('a', new Set(['x']))
    copyLocks('a', 'b')
    expect([...loadLocks('b')]).toEqual(['x'])
    forgetLocks('a')
    expect(loadLocks('a').size).toBe(0)
    expect(loadLocks('b').size).toBe(1)
  })

  it('reads garbage as nothing', () => {
    for (const junk of ['not json', '[1,2]', '{"a":"x"}', 'null']) {
      localStorage.setItem(LOCKS_KEY, junk)
      expect(loadLocks('a').size).toBe(0)
    }
    localStorage.setItem(LOCKS_KEY, '{"a":[1,"ok"]}')
    expect([...loadLocks('a')]).toEqual(['ok'])
  })

  it('prunes ids that are gone', () => {
    expect([...pruneLocks(new Set(['a', 'b']), [P('b'), P('c')])]).toEqual(['b'])
  })
})
