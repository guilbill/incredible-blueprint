import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { runAll } from './scenarios'

const GOLDEN = new URL('./golden.json', import.meta.url)
export const STEPS = 1200

describe('determinism', () => {
  it('matches the golden hashes', () => {
    const got = runAll(STEPS)
    if (process.env.UPDATE_GOLDEN || !existsSync(GOLDEN)) writeFileSync(GOLDEN, JSON.stringify(got, null, 2) + '\n')
    expect(got).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')))
  })

  it('is repeatable within a process', () => {
    expect(runAll(STEPS)).toEqual(runAll(STEPS))
  })
})

describe('dmath', () => {
  it('dsin/dcos/datan2 are close to Math', async () => {
    const { dsin, dcos, datan2, nativeMath: M } = await import('../../src/engine/dmath')
    for (let x = -50; x <= 50; x += 0.01) {
      expect(Math.abs(dsin(x) - M.sin(x))).toBeLessThan(1e-12)
      expect(Math.abs(dcos(x) - M.cos(x))).toBeLessThan(1e-12)
    }
    for (let a = -3.1; a <= 3.1; a += 0.05) {
      for (const r of [0.3, 1, 7]) {
        const y = r * M.sin(a)
        const x = r * M.cos(a)
        expect(Math.abs(datan2(y, x) - M.atan2(y, x))).toBeLessThan(1e-12)
      }
    }
  })
})
