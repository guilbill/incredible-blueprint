import type { Clip } from './selection'

/** Copied parts, kept for the life of the tab and shared by every board (play and editor). */
let clip: Clip | undefined

const cloneClip = (c: Clip): Clip => ({
  placements: c.placements.map((p) => ({ ...p, settings: { ...p.settings } })),
  links: c.links.map((l) => ({ ...l, a: { ...l.a }, b: { ...l.b } })),
})

/** Stores a copy, so later edits to the caller's clip do not reach the clipboard. */
export function setClip(c: Clip): void {
  clip = cloneClip(c)
}

/** A fresh copy of the clipboard, or undefined when nothing was copied. */
export function getClip(): Clip | undefined {
  return clip && cloneClip(clip)
}
