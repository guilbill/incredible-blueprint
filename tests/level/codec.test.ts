import { describe, expect, it } from 'vitest'
import { decodeLevel, encodeLevel, levelFromFile, levelToFile, validateLevel } from '../../src/level/codec'
import type { Level, Placement } from '../../src/level/types'

const P = (o: Partial<Placement> & Pick<Placement, 'id' | 'kind'>): Placement => ({
  x: 100, y: 100, rot: 0, flip: false, settings: {}, ...o,
})

const base = (): Level => ({
  v: 1,
  id: 'custom-1',
  title: 'Mon niveau',
  goalText: 'Faites quelque chose.',
  fixed: [
    P({ id: 'ball', kind: 'ball-base', x: 200, y: 80 }),
    P({ id: 'bucket', kind: 'bucket', x: 720, y: 760 }),
    P({ id: 'wall', kind: 'wall-brick', x: 720, y: 790, rot: 6, settings: { length: 16 } }),
    P({ id: 'g1', kind: 'gear-small', x: 300, y: 300 }),
    P({ id: 'g2', kind: 'gear-small', x: 400, y: 300 }),
  ],
  fixedLinks: [],
  inventory: [{ kind: 'ramp', count: 3 }],
  goals: [
    { type: 'inZone', part: 'ball', zone: { x: 700, y: 700, w: 40, h: 40 }, hold: 60 },
    { type: 'event', event: 'rope-cut' },
    { type: 'event', event: 'cheese-eaten', part: 'ball' },
  ],
})

describe('codec', () => {
  it('round-trips a level with every goal type', async () => {
    const l = base()
    const r = await decodeLevel(await encodeLevel(l))
    expect(r).toEqual({ ok: true, level: l })
  })

  it('encodes a 30-part level in under 2000 chars', async () => {
    const l = base()
    for (let i = 0; i < 25; i++) l.fixed.push(P({ id: `r${i}`, kind: 'ramp', x: 10 * i + 20, y: 20 + 10 * i, rot: 3 }))
    expect(l.fixed.length).toBe(30)
    expect((await encodeLevel(l)).length).toBeLessThan(2000)
  })

  it('uses only url-safe characters', async () => {
    expect(await encodeLevel(base())).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('never throws on broken input and answers in French', async () => {
    const good = await encodeLevel(base())
    const v2 = await encodeLevel({ ...base(), v: 2 } as unknown as Level)
    const unknown = await encodeLevel({ ...base(), fixed: [P({ id: 'x', kind: 'laser' as never })] })
    for (const s of [good.slice(0, 20), 'AAAAAAAAAAAAAAAAAAAAAAAA', 'xyz!!', '', v2, unknown, 'a'.repeat(5000)]) {
      const r = await decodeLevel(s)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(/[a-zé]{3,}/i)
    }
  })

  it('round-trips through a file', async () => {
    const l = base()
    const blob = levelToFile(l)
    const r = await levelFromFile(new File([blob], 'x.tim.json'))
    expect(r).toEqual({ ok: true, level: l })
    const bad = await levelFromFile(new File(['{nope'], 'x.tim.json'))
    expect(bad.ok).toBe(false)
  })
})

describe('validateLevel', () => {
  it('accepts a valid level', () => expect(validateLevel(base())).toBeNull())
  const bad = (name: string, f: (l: Level) => void) =>
    it(`rejects ${name}`, () => {
      const l = structuredClone(base())
      f(l)
      expect(validateLevel(l)).toEqual(expect.any(String))
    })
  it('rejects non objects', () => {
    expect(validateLevel(null)).toEqual(expect.any(String))
    expect(validateLevel(42)).toEqual(expect.any(String))
  })
  bad('a wrong version', (l) => ((l as { v: number }).v = 2))
  bad('an unknown kind', (l) => (l.fixed[0].kind = 'laser' as never))
  bad('rot out of range', (l) => (l.fixed[0].rot = 24))
  bad('rot not allowed by the step', (l) => (l.fixed[2].rot = 5))
  bad('a setting out of range', (l) => (l.fixed[2].settings.length = 9999))
  bad('a fractional setting', (l) => (l.fixed[2].settings.length = 4.5))
  bad('x outside the field', (l) => (l.fixed[0].x = -5))
  bad('y outside the field', (l) => (l.fixed[0].y = 5000))
  bad('duplicate ids', (l) => (l.fixed[1].id = 'ball'))
  bad('a link to a missing part', (l) => l.fixedLinks.push({ id: 'k', kind: 'belt', a: { part: 'g1', anchor: 'belt' }, b: { part: 'nope', anchor: 'belt' } }))
  bad('a link with a missing anchor', (l) => l.fixedLinks.push({ id: 'k', kind: 'belt', a: { part: 'g1', anchor: 'zzz' }, b: { part: 'g2', anchor: 'belt' } }))
  bad('a link with the wrong role', (l) => l.fixedLinks.push({ id: 'k', kind: 'rope', a: { part: 'g1', anchor: 'belt' }, b: { part: 'g2', anchor: 'belt' } }))
  bad('duplicate link ids', (l) => {
    const k = { id: 'ball', kind: 'belt' as const, a: { part: 'g1', anchor: 'belt' }, b: { part: 'g2', anchor: 'belt' } }
    l.fixedLinks.push(k)
  })
  bad('a goal on a missing part', (l) => (l.goals[0] = { type: 'inZone', part: 'ghost', zone: { x: 0, y: 0, w: 1, h: 1 } }))
  bad('an unknown inventory kind', (l) => l.inventory.push({ kind: 'laser' as never, count: 1 }))
  bad('a negative inventory count', (l) => (l.inventory[0].count = -1))
  bad('a missing title', (l) => ((l as { title: unknown }).title = 3))
})

describe('shipped levels', () => {
  it('all validate', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    for (const f of readdirSync('levels').filter((n) => n.endsWith('.json') && !n.endsWith('.solution.json'))) {
      expect([f, validateLevel(JSON.parse(readFileSync(`levels/${f}`, 'utf8')))]).toEqual([f, null])
    }
  })
})
