import { describe, expect, it } from 'vitest'
import { SNOOZE_MS, UpdateNotice } from '../../src/ui/updateNotice'

describe('UpdateNotice', () => {
  it('stays hidden until a new version is waiting', () => {
    const n = new UpdateNotice()
    expect(n.shouldShow(0)).toBe(false)
    n.markReady()
    expect(n.shouldShow(0)).toBe(true)
  })

  it('comes back after "Later" once the snooze is over', () => {
    const n = new UpdateNotice()
    n.markReady()
    n.snooze(1000)
    expect(n.shouldShow(1000 + SNOOZE_MS - 1)).toBe(false)
    expect(n.shouldShow(1000 + SNOOZE_MS)).toBe(true)
  })

  it('comes back at once when a newer version arrives during the snooze', () => {
    const n = new UpdateNotice()
    n.markReady()
    n.snooze(1000)
    n.markReady()
    expect(n.shouldShow(1001)).toBe(true)
  })
})
