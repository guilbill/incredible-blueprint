import { describe, expect, it } from 'vitest'
import { isTypingTarget } from '../../src/ui/keys'

// Tests run without a DOM: elements are stand-ins with the fields the check reads.
const elem = (tagName: string, isContentEditable = false) => ({ tagName, isContentEditable }) as unknown as EventTarget

describe('isTypingTarget', () => {
  it('is true for text fields and editable elements', () => {
    expect(isTypingTarget(elem('INPUT'))).toBe(true)
    expect(isTypingTarget(elem('TEXTAREA'))).toBe(true)
    expect(isTypingTarget(elem('SELECT'))).toBe(true)
    expect(isTypingTarget(elem('DIV', true))).toBe(true)
  })

  it('is false for the board and for no target', () => {
    expect(isTypingTarget(elem('CANVAS'))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
