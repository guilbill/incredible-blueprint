import { describe, expect, it } from 'vitest'
import { guarded } from '../../src/ui/loop'

describe('guarded', () => {
  it('runs the work and reports success', () => {
    let ran = false
    const errors: unknown[] = []
    expect(guarded(() => { ran = true }, (e) => errors.push(e))).toBe(true)
    expect(ran).toBe(true)
    expect(errors).toEqual([])
  })
  it('hands a throw to onError instead of letting it escape', () => {
    const boom = new Error('boom')
    const errors: unknown[] = []
    expect(guarded(() => { throw boom }, (e) => errors.push(e))).toBe(false)
    expect(errors).toEqual([boom])
  })
})
