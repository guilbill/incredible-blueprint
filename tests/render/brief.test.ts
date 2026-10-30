import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { setLang } from '../../src/i18n'
import { FIELD } from '../../src/level/placement'
import type { Level } from '../../src/level/types'
import { type Brief, briefLayout, drawBrief, levelNumber, obstacles, wrapChars } from '../../src/render/brief'
import { objectiveText } from '../../src/objectives'
import { Pen } from '../../src/render/pen'
import { fakeCtx } from './fakeCtx'

const brief: Brief = { number: '03', title: 'La bascule', heading: 'OBJECTIF', goal: 'Lancez la bille d’acier dans le seau.' }

describe('level brief', () => {
  it('wraps the goal on whole words', () => {
    expect(wrapChars('un deux trois quatre', 9)).toEqual(['un deux', 'trois', 'quatre'])
    expect(wrapChars('anticonstitutionnellement court', 5)).toEqual(['anticonstitutionnellement', 'court'])
  })

  it('reads the number of a shipped level only', () => {
    expect(levelNumber('03-la-bascule')).toBe('03')
    expect(levelNumber('custom-abc')).toBeUndefined()
  })

  it('takes the top right corner when it is free', () => {
    const { box } = briefLayout(brief)
    expect(box.x + box.w).toBe(FIELD.w - 20)
    expect(box.y).toBe(20)
  })

  it('moves to the next free corner, and stays top right when none is free', () => {
    const topRight = { x: FIELD.w - 100, y: 40, w: 40, h: 40 }
    expect(briefLayout(brief, [topRight]).box).toMatchObject({ x: 20, y: 20 })
    const everywhere = { x: 0, y: 0, w: FIELD.w, h: FIELD.h }
    expect(briefLayout(brief, [everywhere]).box).toMatchObject({ x: FIELD.w - 20 - 420, y: 20 })
  })

  it('stays on the board for every shipped level, in both languages', () => {
    for (const f of readdirSync('levels').filter((n) => n.endsWith('.json') && !n.endsWith('.solution.json'))) {
      const level = JSON.parse(readFileSync(`levels/${f}`, 'utf8')) as Level
      const avoid = obstacles(level)
      for (const lang of ['fr', 'en'] as const) {
        setLang(lang)
        const { box } = briefLayout({ ...brief, goal: objectiveText(level) }, avoid)
        expect(box.x >= 0 && box.y >= 0 && box.x + box.w <= FIELD.w && box.y + box.h <= FIELD.h, f).toBe(true)
      }
    }
    setLang('fr')
  })

  it('draws without throwing, dimmed or not', () => {
    const pen = new Pen(fakeCtx().ctx)
    expect(() => drawBrief(pen, brief, [], false)).not.toThrow()
    expect(() => drawBrief(pen, { ...brief, number: undefined }, [], true)).not.toThrow()
  })
})
