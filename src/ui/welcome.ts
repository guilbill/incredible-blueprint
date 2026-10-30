import { data } from '../engine/bodies'
import type { Vec } from '../engine/vec'
import { Simulation } from '../game/simulation'
import { t } from '../i18n'
import { objectiveText } from '../objectives'
import { footprint } from '../level/placement'
import type { Level, PartKind, Placement, Solution } from '../level/types'
import { ROT_ANGLE } from '../parts/common'
import { COLORS, Pen } from '../render/pen'
import { render } from '../render/renderer'
import { el } from './dom'
import { clientToUnits, fitCanvas } from './geometry'
import { langSwitch } from './langSwitch'
import { guarded, stepsDue } from './loop'
import { sound } from './sound'
import { createImpactTracker, impactVoice } from './soundLogic'

const p = (id: string, kind: PartKind, x: number, y: number, rot = 0, settings: Record<string, number> = {}): Placement =>
  ({ id, kind, x, y, rot, flip: false, settings })

/**
 * First visit: a machine that only lacks one plank. The ball rests at the top of the first plank,
 * the slot of the second is drawn dashed, the plank lies on the floor. Placing it starts the run.
 */
export const WELCOME_PARTS: Placement[] = [
  p('ball', 'ball-base', 218, 214),
  p('r1', 'ramp', 300, 250, 1, { length: 10 }),
  p('floor-1', 'wall-brick', 480, 770, 6, { length: 16 }),
  p('floor-2', 'wall-brick', 800, 770, 6, { length: 16 }),
  p('floor-3', 'wall-brick', 1120, 770, 6, { length: 16 }),
  p('bucket', 'bucket', 880, 740),
  p('backstop', 'wall-wood', 920, 620, 0, { length: 12 }),
]
/** Where the missing plank goes. */
export const SLOT: Placement = p('plank', 'ramp', 600, 420, 1, { length: 10 })
/** Where it lies until the player picks it up: flat on the floor. */
export const REST: Placement = { ...SLOT, x: 470, y: 752, rot: 0 }
/** A plank dropped this close (units, centre to centre) to the slot snaps into it. */
export const SNAP_DIST = 80
const HALF_LEN = 100

export function welcomeLevel(plank: Placement = SLOT, ball?: Placement): Level {
  const parts = ball ? WELCOME_PARTS.map((q) => (q.id === 'ball' ? ball : q)) : WELCOME_PARTS
  return {
    v: 1, id: 'welcome', title: '', fixed: [...parts, plank], fixedLinks: [], inventory: [],
    goals: [{ type: 'inZone', part: 'ball', zone: { x: 860, y: 720, w: 40, h: 40 } }],
  }
}

/** Whether a point (units) is on the plank, with a margin so a finger can grab it. */
export function onPlank(plank: Placement, at: Vec): boolean {
  const a = plank.rot * ROT_ANGLE
  const dx = at.x - plank.x
  const dy = at.y - plank.y
  const along = dx * Math.cos(a) + dy * Math.sin(a)
  const across = -dx * Math.sin(a) + dy * Math.cos(a)
  return Math.abs(along) < HALF_LEN + 12 && Math.abs(across) < 22
}

/** The plank held at `at`: in the slot when close enough, else flat where the pointer is. */
export function heldPlank(at: Vec): Placement {
  return Math.hypot(at.x - SLOT.x, at.y - SLOT.y) < SNAP_DIST ? SLOT : { ...REST, x: at.x, y: at.y }
}

/** The ball's twitch down the slope while it waits: a short nudge every 1.6 s, in units. */
function twitch(ms: number): number {
  const phase = (ms % 1600) / 1600
  return phase < 0.25 ? Math.sin(phase * 4 * Math.PI) * 2.5 : 0
}

const EMPTY: Solution = { placements: [], links: [] }
const LEAVE_DELAY_MS = 700
const SLIDE_MS = 900

export interface WelcomeOpts {
  /** The ball reached the bucket and the board slid away: open the first level. */
  onDone(): void
  /** The player skipped to the level list. */
  onLevels(): void
}

export function mountWelcome(root: HTMLElement, opts: WelcomeOpts): () => void {
  const screen = el('div', 'welcome')
  const head = el('header', 'welcome-head')
  const title = el('h1', '', t('list.title'))
  const levels = el('button', 'btn ghost', t('list.tabShipped'))
  levels.addEventListener('click', () => opts.onLevels())
  const right = el('div', 'welcome-links')
  right.append(levels, langSwitch())
  head.append(title, right)
  const stage = el('div', 'welcome-stage')
  const canvas = el('canvas')
  canvas.tabIndex = 0
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', t('welcome.board'))
  stage.append(canvas)
  screen.append(head, stage)
  root.replaceChildren(screen)
  sound.arm()

  const ctx = canvas.getContext('2d')!
  let zoom = 1
  let dirty = true
  const resize = (): void => {
    const pad = getComputedStyle(stage)
    const w = stage.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight)
    const h = stage.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom)
    const fit = fitCanvas(w, h, window.devicePixelRatio || 1)
    canvas.style.width = `${fit.cssW}px`
    canvas.style.height = `${fit.cssH}px`
    canvas.width = fit.pxW
    canvas.height = fit.pxH
    zoom = fit.zoom
    dirty = true
  }
  const ro = new ResizeObserver(resize)
  ro.observe(stage)

  let plank = REST
  let grab: Vec | null = null
  let sim: Simulation | undefined
  let won = false
  let acc = 0
  let last = performance.now()
  const t0 = last
  let raf = 0
  let timers: number[] = []
  const impacts = createImpactTracker<{ key: string; impulse: number; kinds: (PartKind | undefined)[] }>()

  const units = (e: PointerEvent): Vec => clientToUnits(e.clientX, e.clientY, canvas.getBoundingClientRect())
  const start = (): void => {
    plank = SLOT
    sim = new Simulation(welcomeLevel(), EMPTY)
    canvas.style.cursor = ''
    dirty = true
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (sim) return
    const at = units(e)
    if (!onPlank(plank, at)) return
    canvas.setPointerCapture(e.pointerId)
    grab = { x: plank.x - at.x, y: plank.y - at.y }
    canvas.style.cursor = 'grabbing'
    sound.click()
  })
  canvas.addEventListener('pointermove', (e) => {
    if (sim) return
    const at = units(e)
    if (!grab) {
      canvas.style.cursor = onPlank(plank, at) ? 'grab' : ''
      return
    }
    const next = heldPlank({ x: at.x + grab.x, y: at.y + grab.y })
    if (next === SLOT && plank !== SLOT) sound.click()
    plank = next
  })
  const drop = (): void => {
    if (!grab) return
    grab = null
    if (plank === SLOT) start()
    else {
      plank = REST
      canvas.style.cursor = ''
    }
  }
  canvas.addEventListener('pointerup', drop)
  canvas.addEventListener('pointercancel', drop)
  // Keyboard: the board is focusable, Enter or Space puts the plank in place.
  canvas.addEventListener('keydown', (e) => {
    if (sim || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    sound.click()
    start()
  })

  const listen = (s: Simulation): void => {
    const kindOf = (b: Parameters<typeof data>[0]): PartKind | undefined => {
      const id = data(b).part
      return id === null ? undefined : s.parts.find((q) => q.id === id)?.kind
    }
    const hit = impacts(s.lastContacts.filter((c) => !c.began).map((c) => ({ key: `${kindOf(c.a)}:${kindOf(c.b)}`, impulse: c.impulse, kinds: [kindOf(c.a), kindOf(c.b)] })))
    if (hit) sound.impact(impactVoice(hit.kinds), hit.impulse)
  }

  const leave = (): void => {
    timers.push(window.setTimeout(() => {
      screen.classList.add('leaving')
      timers.push(window.setTimeout(() => opts.onDone(), SLIDE_MS))
    }, LEAVE_DELAY_MS))
  }

  const drawSlot = (pen: Pen, ms: number): void => {
    pen.reset(COLORS.cyan, 1.5)
    pen.ctx.globalAlpha = 0.55 + 0.25 * Math.sin(ms / 500)
    pen.dashed(true)
    pen.poly(footprint(SLOT))
    pen.ctx.globalAlpha = 1
    pen.reset()
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    const due = stepsDue(acc, now - last)
    last = now
    acc = due.acc
    guarded(() => {
      if (sim && !won) {
        for (let i = 0; i < due.steps && !won; i++) {
          sim.step()
          listen(sim)
          if (sim.goalsMet) {
            won = true
            dirty = true
            sound.win()
            leave()
          }
        }
      }
      const ms = now - t0
      const base = WELCOME_PARTS[0]
      const k = sim ? 0 : twitch(ms)
      const ball = { ...base, x: base.x + k * Math.cos(ROT_ANGLE), y: base.y + k * Math.sin(ROT_ANGLE) }
      // Waiting boards animate (twitch, pulsing slot); a won board stops drawing.
      if (won && !dirty) return
      dirty = false
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      render(ctx, { level: welcomeLevel(plank, ball), sol: EMPTY, sim, zoom, won, selected: grab ? [plank.id] : undefined, brief: { title: t('welcome.briefTitle'), heading: t('brief.goal'), goal: objectiveText(welcomeLevel()) } })
      if (!sim && plank !== SLOT) {
        ctx.setTransform(zoom, 0, 0, zoom, 0, 0)
        drawSlot(new Pen(ctx), ms)
      }
    }, (err) => console.error(err))
  }
  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    timers.forEach(clearTimeout)
    timers = []
    ro.disconnect()
    root.replaceChildren()
  }
}
