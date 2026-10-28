import { describe, expect, it } from 'vitest'
import { asShared, decodeLevel, encodeLevel, levelFromFile, levelToFile, validateLevel } from '../../src/level/codec'
import { FIELD } from '../../src/level/placement'
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

  it('refuses a file over 1 MB without reading it', async () => {
    const f = new File(['x'.repeat(1_000_001)], 'big.tim.json')
    let read = false
    f.text = () => { read = true; return Promise.resolve('{}') }
    expect(await levelFromFile(f)).toEqual({ ok: false, error: expect.stringMatching(/trop gros/) })
    expect(read).toBe(false)
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
  bad('a title over 60 chars', (l) => (l.title = 'x'.repeat(61)))
  bad('a goal text over 300 chars', (l) => (l.goalText = 'x'.repeat(301)))
  bad('more than 100 fixed links', (l) => {
    for (let i = 0; i < 101; i++) l.fixedLinks.push({ id: `k${i}`, kind: 'belt', a: { part: 'g1', anchor: 'belt' }, b: { part: 'g2', anchor: 'belt' } })
  })
  bad('more than 20 goals', (l) => {
    for (let i = 0; i < 18; i++) l.goals.push({ type: 'event', event: 'rope-cut' })
  })
  bad('an inventory count over 99', (l) => (l.inventory[0].count = 100))
  bad('a fractional inventory count', (l) => (l.inventory[0].count = 1.5))
  bad('a hold of 0', (l) => ((l.goals[0] as { hold: number }).hold = 0))
  bad('a fractional hold', (l) => ((l.goals[0] as { hold: number }).hold = 1.5))
  bad('a hold over 3600', (l) => ((l.goals[0] as { hold: number }).hold = 3601))
  bad('a zone sticking out of the field', (l) => ((l.goals[0] as { zone: { x: number } }).zone.x = 1270))
  bad('a zone with a negative corner', (l) => ((l.goals[0] as { zone: { y: number } }).zone.y = -1))
  bad('an empty zone', (l) => ((l.goals[0] as { zone: { w: number } }).zone.w = 0))
  bad('a flipped part that cannot flip', (l) => (l.fixed[3].flip = true))
  bad('a fixed part overlapping an earlier one', (l) => l.fixed.push(P({ id: 'ball2', kind: 'ball-base', x: 200, y: 80 })))
  bad('a fixed part whose footprint leaves the field', (l) => l.fixed.push(P({ id: 'edge', kind: 'ball-bowling', x: 0, y: 400 })))
  it('accepts edge values: 99 in stock, hold 1 and 3600, a zone filling the field', () => {
    const l = base()
    l.inventory[0].count = 99
    l.goals[0] = { type: 'inZone', part: 'ball', zone: { x: 0, y: 0, w: FIELD.w, h: FIELD.h }, hold: 1 }
    l.goals.push({ type: 'inZone', part: 'ball', zone: { x: 0, y: 0, w: 10, h: 10 }, hold: 3600 })
    expect(validateLevel(l)).toBeNull()
  })
  it('rejects a level of ~5000 walls quickly, without checking them all against each other', () => {
    const l = base()
    for (let i = 0; i < 5000; i++) l.fixed.push(P({ id: `w${i}`, kind: 'wall-brick', x: 20 + (i % 60) * 20, y: 20 + Math.floor(i / 60) * 9, settings: { length: 1 } }))
    const t = Date.now()
    expect(validateLevel(l)).toMatch(/trop de pièces/)
    expect(Date.now() - t).toBeLessThan(200)
  })
  it('rejects more than 300 fixed parts even when they do not overlap', () => {
    const l = base()
    l.fixed = l.fixed.slice(0, 1)
    for (let i = 0; i < 300; i++) l.fixed.push(P({ id: `b${i}`, kind: 'ball-tennis', x: 20 + (i % 30) * 40, y: 200 + Math.floor(i / 30) * 40 }))
    expect(validateLevel(l)).toMatch(/trop de pièces/)
    l.fixed.pop()
    expect(validateLevel(l)).toBeNull()
  })
})

describe('shipped levels', () => {
  it('all validate', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    for (const f of readdirSync('levels').filter((n) => n.endsWith('.json') && !n.endsWith('.solution.json'))) {
      expect([f, validateLevel(JSON.parse(readFileSync(`levels/${f}`, 'utf8')))]).toEqual([f, null])
    }
  })
})

describe('shared ids', () => {
  it('rejects unsafe ids', () => {
    for (const id of ['', 'a b', '../x', 'x'.repeat(65)]) expect(validateLevel({ ...base(), id })).toEqual(expect.any(String))
  })
  it('namespaces a level whose id equals a built-in id', async () => {
    const l = asShared({ ...base(), id: '00-sandbox' })
    expect(l.id).toMatch(/^shared-[a-z0-9]+$/)
    expect(l.id).toBe(asShared({ ...base(), id: '00-sandbox' }).id)
    expect(validateLevel(l)).toBeNull()
    expect(l.id).not.toBe('00-sandbox')
  })
})
