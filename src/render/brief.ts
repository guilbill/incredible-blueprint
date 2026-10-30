import { FIELD, footprint } from '../level/placement'
import type { Level, Rect } from '../level/types'
import { COLORS, type Pen } from './pen'

/** Level brief drawn on the board: a blueprint title block (number, title, goal) in a free corner. */
export interface Brief {
  /** Level number ("03"), or none for a custom level. */
  number?: string
  title: string
  /** Goal heading ("OBJECTIF"), translated. */
  heading: string
  goal: string
}

const W = 420
const MARGIN = 20
const HEAD = 54
const GOAL_SIZE = 18
const LINE = 26
const PAD = 16
const NUM_W = 70
/** Monospace glyphs are 0.6 em wide: the goal wraps on a character count, so the layout needs no canvas. */
const GOAL_CHARS = Math.floor((W - 2 * PAD) / (GOAL_SIZE * 0.6))

/** Word-wraps `text` to lines of at most `max` characters (a longer word gets a line of its own). */
export function wrapChars(text: string, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${w}` : w
    if (line && next.length > max) {
      lines.push(line)
      line = w
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

/** Room kept between the block and a part or goal zone. */
const CLEAR = 10

const hits = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w + CLEAR && b.x < a.x + a.w + CLEAR && a.y < b.y + b.h + CLEAR && b.y < a.y + a.h + CLEAR

/** Bounding boxes of the level's locked parts and goal zones: what the block must not cover. */
export function obstacles(level: Pick<Level, 'fixed' | 'goals'>): Rect[] {
  const rects: Rect[] = []
  for (const p of level.fixed) {
    const fp = footprint(p)
    const xs = fp.map((q) => q.x)
    const ys = fp.map((q) => q.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    rects.push({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y })
  }
  for (const g of level.goals) if (g.type === 'inZone') rects.push(g.zone)
  return rects
}

/**
 * Box and goal lines of the title block: the first free corner, top right first, then top left,
 * bottom right, bottom left. With no free corner it stays top right, drawn under the parts.
 */
export function briefLayout(b: Brief, avoid: Rect[] = []): { box: Rect; lines: string[] } {
  const lines = wrapChars(b.goal, GOAL_CHARS)
  const h = HEAD + 22 + lines.length * LINE + 14
  const right = FIELD.w - W - MARGIN
  const bottom = FIELD.h - h - MARGIN
  const corners: Rect[] = [[right, MARGIN], [MARGIN, MARGIN], [right, bottom], [MARGIN, bottom]].map(([x, y]) => ({ x, y, w: W, h }))
  const box = corners.find((c) => !avoid.some((o) => hits(c, o))) ?? corners[0]
  return { box, lines }
}

/** The level number from a shipped id ("03-la-bascule" → "03"). */
export function levelNumber(id: string): string | undefined {
  return /^(\d+)-/.exec(id)?.[1]
}

function text(pen: Pen, s: string, x: number, y: number, size: number, color: string, opts: { bold?: boolean; center?: boolean } = {}): void {
  const c = pen.ctx
  c.fillStyle = color
  c.font = `${opts.bold ? 'bold ' : ''}${size}px monospace`
  c.textAlign = opts.center ? 'center' : 'left'
  c.textBaseline = 'alphabetic'
  c.fillText(s, x, y)
}

/** Draws the title block; `dim` while the machine runs, so it stays out of the way. */
export function drawBrief(pen: Pen, b: Brief, avoid: Rect[], dim: boolean): void {
  const { box, lines } = briefLayout(b, avoid)
  const { x, y, w, h } = box
  const c = pen.ctx
  c.save()
  // the grid shows through faintly so the block reads as drawn on the plan, not stuck on it
  c.globalAlpha = dim ? 0.3 : 0.85
  c.fillStyle = COLORS.bg
  c.fillRect(x, y, w, h)
  c.globalAlpha = dim ? 0.35 : 1
  pen.reset(COLORS.line, 2)
  pen.poly([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }])
  pen.reset(COLORS.line, 1)
  pen.line({ x, y: y + HEAD }, { x: x + w, y: y + HEAD })
  const tx = b.number ? x + NUM_W : x
  if (b.number) {
    pen.line({ x: tx, y }, { x: tx, y: y + HEAD })
    text(pen, b.number, x + NUM_W / 2, y + 37, 22, COLORS.line, { bold: true, center: true })
  }
  text(pen, b.title.toUpperCase(), tx + PAD, y + 37, 20, COLORS.line, { bold: true })
  text(pen, b.heading, x + PAD, y + HEAD + 22, 11, COLORS.note)
  lines.forEach((l, i) => text(pen, l, x + PAD, y + HEAD + 22 + (i + 1) * LINE, GOAL_SIZE, COLORS.yellow))
  c.restore()
  pen.reset()
}
