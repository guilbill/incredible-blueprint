import { partDef } from '../parts/registry'
import type { PartKind, Placement } from '../level/types'
import type { Pen } from '../render/pen'

/**
 * Design bench (dev only, `/lab.html`): a topic shows 2 to 5 variants side by side so the user picks
 * one before anything is coded in the game. Variants draw with the real parts and play the real sounds.
 */
export interface Variant {
  name: string
  /** One line on what differs. */
  note?: string
  /** Draws on a blueprint board of `w` × `h` units (1 unit = 1 game unit, scaled to fit). */
  draw?(pen: Pen, size: { w: number; h: number }): void
  /** Plays a sound; shown as a ▶ button. */
  play?(): void
  /** Builds a live prototype inside `el`; returns a cleanup. */
  mount?(el: HTMLElement): (() => void) | void
}

export interface LabTopic {
  title: string
  /** The question the user answers by picking a variant. */
  question: string
  /** Board size in game units for `draw` variants. */
  board?: { w: number; h: number }
  variants: Variant[]
}

export const defineLab = (topic: LabTopic): LabTopic => topic

/** Draws a real part, as the game does, at x, y (centre of its footprint). */
export function drawPart(pen: Pen, kind: PartKind, x: number, y: number, extra: Partial<Placement> = {}): void {
  const placement: Placement = { id: `lab-${kind}`, kind, x, y, rot: 0, flip: false, settings: {}, ...extra }
  pen.reset()
  partDef(kind).draw?.(pen, { placement })
}
