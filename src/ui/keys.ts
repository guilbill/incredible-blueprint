/** Keyboard helpers shared by the board's shortcuts. */

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/** Whether a key event's target takes text, so board shortcuts must leave the key alone. */
export function isTypingTarget(t: EventTarget | null): boolean {
  const e = t as { tagName?: string; isContentEditable?: boolean } | null
  return !!e && (TYPING_TAGS.has(e.tagName ?? '') || !!e.isContentEditable)
}

/** Mac keyboards use Cmd where others use Ctrl. */
export function isMac(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  return /mac|iphone|ipad/i.test(nav.userAgentData?.platform ?? nav.platform ?? '')
}
