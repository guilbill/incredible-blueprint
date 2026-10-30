import { data, velocity } from '../engine/bodies'
import { bodyPose } from '../engine/world'
import { Simulation } from '../game/simulation'
import { len, sub, v, type Vec } from '../engine/vec'
import { levelGoal, levelTitle, partLabel, settingLabel, t } from '../i18n'
import { FIELD, footprint, gearMagnet, snap } from '../level/placement'
import type { Anchor, Goal, Guide, Level, PartKind, Placement, Rect, Solution } from '../level/types'
import { ROT_ANGLE, angleOf, setting } from '../parts/common'
import { gearRadius, gearsMesh } from '../parts/mech/gear'
import { partDef } from '../parts/registry'
import { Pen, type PartDrawState } from '../render/pen'
import { NUDGE_MS, labelDone, PULSE_MS, render, type RenderView } from '../render/renderer'
import { loadProgress, markSolved, saveDraft } from '../storage'
import { addLink, addPart, anchorAt, draftPlacement, drawerDefaults, flipped, freeAngle, grow, HANDLE_HIT, handlesOf, hitAnyPart, hitHandle, hitLink, hitPart, linkTargets, nextId, pickAnchor, remaining, removeLink, removePart, resizeToward, rotateToward, rotated, rotHandleOffset, sanitizeDraft, updatePart, withSetting, type HandleKind, type LinkTool } from './edit'
import { clientToUnits, fitCanvas, insideField, panelPosition, rectFromDrag, unitsToClient } from './geometry'
import { guarded, stepsDue } from './loop'
import { el } from './dom'
import { icon, type IconName } from './icons'
import { getClip, setClip } from './clipboard'
import { isMac, isTypingTarget } from './keys'
import { openMenu, type MenuItem } from './menu'
import { langSwitch } from './langSwitch'
import { allShortcuts, hintsFor, type Hint } from './shortcuts'
import { sound } from './sound'
import { copyGroup, groupBox, groupNotches, groupRotHandle, groupRotStep, guidesFor, moveGroup, moveZone, pasteClip, removeGroup, resizeZone, rotateGroup, rotationBlockers, selectInRect, turnedParts, zoneAt, zoneCorner, type Clip, type Corner } from './selection'
import { activeLoops, createImpactTracker, impactVoice, startedParts } from './soundLogic'
import { anyMoving, createStallWatch, type StallReason } from './stall'

export interface PlayOpts {
  onWin(): void
  onBack(): void
  /** Called once when the goals are met, with the winning solution. */
  onSolved?(sol: Solution): void
  backLabel?: string
  nextLabel?: string
  /** Editor test run: a banner over the run button says so, with an Edit button that calls onBack, even mid-run. */
  testing?: boolean
  /** Level editor: the same board edits the level's fixed parts instead of a player solution. */
  author?: AuthorOpts
}

/**
 * Author mode. The board edits `initial` (the level's fixed parts and links) as if it were a
 * solution, with every kind in the drawer and no limit; there is no run button and no saved draft.
 */
export interface AuthorOpts {
  initial: Solution
  onChange(sol: Solution): void
  /** Goals drawn on the field; read every frame. */
  goals(): Goal[]
  /** While true, a press and drag on the field traces a zone instead of editing parts. */
  tracing(): boolean
  onTraced(zone: { x: number; y: number; w: number; h: number }): void
  /** Replaces the zone of the inZone goal `i` (moved or resized on the board). Not an undo step. */
  setZone(i: number, zone: Rect): void
  /** Makes the inZone goal `i` aim at another part (picked from the zone's label). Not an undo step. */
  setGoalPart(i: number, part: string): void
  /** The goal selected on the board changed (a zone clicked, or the selection cleared). */
  onSelectGoal(g: Goal | undefined): void
  /** Called once at mount: lets the editor select a goal on the board (a zone; anything else clears it). */
  link(board: { selectGoal(g: Goal | undefined): void }): void
  /** Removes goal `i`. Not an undo step. */
  removeGoal(i: number): void
  /** Ids of the locked parts (author aid, kept outside the level); read every frame. */
  locked(): ReadonlySet<string>
  /** Locks or unlocks parts. Not an undo step. */
  setLocked(ids: readonly string[], on: boolean): void
  /** Toolbar content after the back button, and the side panel left of the field. */
  toolbar: HTMLElement[]
  side: HTMLElement
}

interface Drag {
  kind: PartKind
  /** Set when moving an already placed part (its pose before the drag). */
  moving?: Placement
  id: string
  /** Part centre minus pointer, in units, so the part does not jump under the cursor. */
  offset: Vec
  start: { x: number; y: number }
  started: boolean
  ghost?: Placement
  ok: boolean
  /** Contact points with the gears the ghost meshes with, while it is valid. */
  meshMarks?: Vec[]
}

/** Press on a part of a multi-selection: past the drag threshold the whole group moves. */
interface GroupDrag {
  ids: string[]
  /** Part pressed: a click without moving makes it the sole selection. */
  pressed: string
  start: { x: number; y: number }
  /** Press point in units. */
  from: Vec
  started: boolean
  /** Snapped offset from the press point. */
  dx: number
  dy: number
  /** The moved solution, or null when the group does not fit there. */
  next: Solution | null
  guides: Guide[]
}

/** Press on a goal zone (author mode): a corner resizes it, the body moves it. */
interface ZoneDrag {
  i: number
  /** Corner pressed, or undefined to move the whole zone. */
  corner?: Corner
  /** The zone at the press. */
  orig: Rect
  /** Press point in units. */
  from: Vec
  /** Press point on screen, and whether the pointer has passed the drag threshold (a plain click changes nothing). */
  start: { x: number; y: number }
  started: boolean
}

/** Room kept under the board for the hint line. */
const HINTS_H = 30
/** Arrow-key nudge (units), and with Shift. */
const NUDGE_STEP = 10
const NUDGE_STEP_BIG = 50
/** Arrow keys as unit directions on the board. */
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/** Rectangle spanned by two corners. */
const rectBetween = (a: Vec, b: Vec): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) })

/** Pixels the pointer must travel before a press on a placed part becomes a move (else it's a click). */
const DRAG_THRESHOLD = 4

/** Drawer icons of the link tools (rope: a line between two points; belt: a loop around two pulleys). */
const TOOL_ICONS: Record<LinkTool, string> = {
  rope: `<svg viewBox="15 7 80 43" width="56" height="30" aria-hidden="true">
    <path d="M24 40 C40 30 60 20 86 14" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="24" cy="40" r="3" fill="currentColor"/><circle cx="86" cy="14" r="3" fill="currentColor"/>
  </svg>`,
  belt: `<svg viewBox="128 12 72 38" width="56" height="30" aria-hidden="true">
    <g fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.7">
      <circle cx="143" cy="31" r="10"/><circle cx="189" cy="25" r="6"/>
    </g>
    <circle cx="143" cy="31" r="1.6" fill="currentColor"/><circle cx="189" cy="25" r="1.4" fill="currentColor"/>
    <path d="M141.4,18.1 L188.1,16.0 A9,9 0 0 1 190.0,33.9 L144.6,43.9 A13,13 0 1 1 141.4,18.1 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4"/>
  </svg>`,
}

/** Small line-art icon of a part for the drawer. */
function partIcon(kind: PartKind): HTMLCanvasElement {
  const size = 44
  const dpr = window.devicePixelRatio || 1
  const c = el('canvas', 'icon')
  c.width = size * dpr
  c.height = size * dpr
  c.style.width = c.style.height = `${size}px`
  const ctx = c.getContext('2d')
  const def = partDef(kind)
  if (!ctx || !def.draw) return c
  const p: Placement = { id: 'icon', kind, x: 0, y: 0, rot: 0, flip: false, settings: {} }
  const fp = footprint(p)
  const w = Math.max(...fp.map((q) => q.x)) - Math.min(...fp.map((q) => q.x))
  const h = Math.max(...fp.map((q) => q.y)) - Math.min(...fp.map((q) => q.y))
  const s = Math.min(1.2, (size - 8) / Math.max(w, h))
  ctx.scale(dpr, dpr)
  ctx.translate(size / 2, size / 2)
  ctx.scale(s, s)
  def.draw(new Pen(ctx), { placement: p })
  return c
}

export function mountPlay(root: HTMLElement, level: Level, opts: PlayOpts): () => void {
  const author = opts.author
  let sol: Solution = author ? author.initial : sanitizeDraft(level, loadProgress().drafts[level.id])
  /** Zone being traced (author mode), from press point to pointer. */
  let trace: { a: Vec; b: Vec } | undefined
  let sim: Simulation | undefined
  let won = false
  /** Selected placements of the board, in selection order, no duplicates. */
  let selection: string[] = []
  /** Selected player link (rope or belt), exclusive with `selection`. */
  let selectedLink: string | undefined
  /** Active link tool: clicks on the field pick anchors instead of selecting or dragging. */
  let tool: LinkTool | undefined
  /** First anchor of the link being made with the tool. */
  let first: Anchor | undefined
  /** Targets of the tool, recomputed only when the tool, the first anchor or the solution change. */
  let targetsCache: { tool: LinkTool; first?: Anchor; sol: Solution; list: Anchor[] } | undefined
  /** Part under the pointer and when the hover on it started (performance.now). */
  let hover: { id: string; since: number } | undefined
  /** Last pointer position on the field, in units (end of the pending link line). */
  let pointer: Vec | undefined
  let stall = createStallWatch()
  /** Handle of the selected part being pressed: a click steps it, a drag sets it from the pointer. */
  let grip: { kind: HandleKind; start: { x: number; y: number }; moved: boolean; free?: number; recorded?: boolean } | undefined
  /**
   * Rotate handle of a multi-selection being pressed: the group is shown turned by `notches` from its pose at
   * the press (`base`) around a fixed pivot, and lands on the last pose that fitted (`valid`) when released.
   */
  let spin: {
    ids: string[]; base: Solution; pivot: Vec; radius: number; step: number; start: { x: number; y: number }; moved: boolean; free?: number
    notches: number
    /** The group's parts turned by `notches`, fitting or not. */
    turned: Placement[]
    /** The turned solution, or null when the group does not fit there; then `blockers` are the parts in the way. */
    next: Solution | null
    blockers: string[]
    valid: Solution
  } | undefined
  /** Part whose chevrons last nudged, and since when (they nudge again each time a part is selected). */
  let nudgeFor: string | undefined
  let selectedSince = 0
  /** Length handle under the pointer, and since when (its chevron beats while hovered). */
  let hoverEnd: { end: 'start' | 'end'; since: number } | undefined
  let drag: Drag | undefined
  let group: GroupDrag | undefined
  /** Selected goal (author mode), exclusive with the part selection. Kept by reference: the goals panel can remove others, which shifts indexes. */
  let selectedGoal: Goal | undefined
  /** Last goal reported to the editor through onSelectGoal. */
  let notifiedGoal: Goal | undefined
  let zoneDrag: ZoneDrag | undefined
  /** Index of the selected goal in `author.goals()`, or -1 when none is selected or it is gone. */
  const zoneIndex = (): number => (selectedGoal && author ? author.goals().indexOf(selectedGoal) : -1)
  /** Selection rectangle dragged on empty space; `base` is the selection kept under it (Shift). */
  let marquee: { a: Vec; b: Vec; base: string[] } | undefined
  let acc = 0
  let lastT: number | undefined
  let fit = fitCanvas(1, 1, 1)
  let raf = 0
  /**
   * While building, the board only changes after an input event, a resize or a UI refresh, so frames
   * with none of those are skipped. While the machine runs every frame is drawn.
   */
  let dirty = true
  const markDirty = (): void => {
    dirty = true
  }
  const DIRTY_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'keydown', 'keyup', 'click', 'input', 'change', 'wheel'] as const
  let toastTimer = 0
  sound.arm()
  const impacts = createImpactTracker<{ key: string; impulse: number; kinds: (PartKind | undefined)[] }>()
  let nextBodyId = 0
  const bodyIds = new WeakMap<object, number>()
  const bodyId = (b: object): number => {
    const known = bodyIds.get(b)
    if (known !== undefined) return known
    const id = ++nextBodyId
    bodyIds.set(b, id)
    return id
  }
  let prevGlow = new Map<string, number>()

  // ---- DOM ----
  const screen = el('div', 'play')
  const toolbar = el('header', 'toolbar')
  const back = el('button', 'btn ghost', opts.backLabel ?? t('play.back'))
  const title = el('h1', '', levelTitle(level))
  const goal = el('p', 'goal', levelGoal(level))
  const mute = el('button', 'btn ghost mute')
  const refreshMute = (): void => {
    const m = sound.isMuted()
    mute.textContent = m ? '🔇' : '🔊'
    mute.title = m ? t('sound.on') : t('sound.off')
    mute.setAttribute('aria-label', mute.title)
    mute.setAttribute('aria-pressed', String(m))
  }
  refreshMute()
  mute.addEventListener('click', () => {
    sound.setMuted(!sound.isMuted())
    refreshMute()
    sound.click()
  })
  if (author) toolbar.append(back, ...author.toolbar, mute, langSwitch())
  else toolbar.append(back, title, goal, mute, langSwitch())

  const stage = el('main', 'stage')
  const canvas = el('canvas')
  const selPanel = el('div', 'selpanel')
  // author mode: on the selected goal zone, the part it aims at; a click lists the others
  const zoneTag = el('button', 'zonetag')
  zoneTag.type = 'button'
  zoneTag.hidden = true
  zoneTag.title = t('goals.pickPart')
  zoneTag.setAttribute('aria-label', zoneTag.title)
  const zoneTagText = el('span')
  zoneTag.append(zoneTagText, icon('chevron'))
  const toast = el('div', 'toast')
  // "Try again?" prompt: never blocks the run, so a slow machine can still reach its goal behind it
  const retry = el('div', 'retry')
  const retryText = el('span')
  const retryBtn = el('button', 'btn small', t('retry.button'))
  retryBtn.addEventListener('click', () => stop())
  retry.append(retryText, retryBtn)
  retry.hidden = true
  // shortcuts useful right now, under the board; the help overlay lists them all
  const hints = el('div', 'hints')
  const help = el('div', 'help')
  help.hidden = true
  help.addEventListener('click', () => closeHelp())
  stage.append(canvas, hints, selPanel, zoneTag, toast, retry, help)
  const ctx = canvas.getContext('2d')!

  const drawer = el('aside', 'drawer')
  // undo / redo of placements, links and settings (not of the run)
  const history = el('div', 'history')
  const undoBtn = el('button', 'hist', '↶')
  const redoBtn = el('button', 'hist', '↷')
  undoBtn.title = t('drawer.undo')
  redoBtn.title = t('drawer.redo')
  undoBtn.setAttribute('aria-label', undoBtn.title)
  redoBtn.setAttribute('aria-label', redoBtn.title)
  undoBtn.addEventListener('click', () => { undo(); undoBtn.blur() })
  redoBtn.addEventListener('click', () => { redo(); redoBtn.blur() })
  history.append(undoBtn, redoBtn)
  const tools = el('div', 'tools')
  const toolButtons = new Map<LinkTool, HTMLButtonElement>()
  for (const lt of ['rope', 'belt'] as const) {
    const b = el('button', 'tool')
    b.dataset.tool = lt
    b.innerHTML = TOOL_ICONS[lt]
    b.append(el('span', 'name', lt === 'rope' ? t('tool.rope') : t('tool.belt')))
    b.addEventListener('click', () => {
      if (sim) return
      tool = tool === lt ? undefined : lt
      first = undefined
      selection = []
      selectedLink = undefined
      refreshUi()
      b.blur()
    })
    tools.append(b)
    toolButtons.set(lt, b)
  }
  drawer.append(history, tools, el('h2', '', t('play.parts')))
  const list = el('ul', 'inventory')
  drawer.append(list)

  const launch = el('button', 'launch', t('play.run'))
  launch.title = t('play.runTitle')
  const testBanner = el('div', 'test-banner')
  const editBtn = el('button', 'btn small edit')
  editBtn.append(icon('edit'), t('editor.edit'))
  editBtn.addEventListener('click', () => opts.onBack())
  testBanner.append(el('span', '', t('editor.testMode')), editBtn)

  const winPanel = el('div', 'win')
  winPanel.hidden = true
  const winBox = el('div', 'win-box')
  const next = el('button', 'btn primary', opts.nextLabel ?? t('win.next'))
  const replay = el('button', 'btn', t('win.replay'))
  winBox.append(el('h2', '', t('win.title')), el('p', '', levelGoal(level)), next, replay)
  winPanel.append(winBox)

  if (author) {
    screen.classList.add('author')
    author.side.classList.add('side')
    screen.append(toolbar, author.side, stage, drawer)
  } else {
    screen.append(toolbar, stage, drawer, launch, winPanel)
    if (opts.testing) {
      screen.classList.add('testing')
      screen.insertBefore(testBanner, launch)
    }
  }
  root.replaceChildren(screen)

  // ---- inventory drawer ----
  const items = new Map<PartKind, { li: HTMLLIElement; count: HTMLSpanElement }>()
  for (const { kind } of level.inventory) {
    if (items.has(kind)) continue
    const li = el('li', 'item')
    const count = el('span', 'count')
    li.append(partIcon(kind), el('span', 'name', partLabel(kind)), count)
    li.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || sim || (remaining(level, sol).get(kind) ?? 0) <= 0) return
      e.preventDefault()
      selection = []
      tool = undefined
      first = undefined
      drag = { kind, id: nextId(level, sol), offset: { x: 0, y: 0 }, start: { x: e.clientX, y: e.clientY }, started: true, ok: false }
      updateDrag(e)
      refreshUi()
    })
    list.append(li)
    items.set(kind, { li, count })
  }

  function refreshDrawer(): void {
    const left = remaining(level, sol)
    for (const [kind, { li, count }] of items) {
      const n = left.get(kind) ?? 0
      count.textContent = author ? '∞' : `×${n}`
      li.classList.toggle('empty', n <= 0)
    }
  }

  // ---- selection panel ----
  /** The selected part when exactly one is selected (handles, settings panel, R and F work on it). */
  const single = (): Placement | undefined => (selection.length === 1 ? sol.placements.find((p) => p.id === selection[0]) : undefined)

  // ---- locks (author only) ----
  const isLocked = (id: string): boolean => !!author?.locked().has(id)
  /** The selection without its locked parts: what moving, copying and deleting act on. */
  const unlocked = (): string[] => selection.filter((id) => !isLocked(id))
  const allLocked = (): boolean => selection.length > 0 && selection.every(isLocked)

  /** All selected parts locked: unlock them, else lock them all. */
  function toggleLock(): void {
    if (!author || sim || !selection.length) return
    author.setLocked(selection, !allLocked())
    panelFor = undefined
    refreshUi()
  }

  /** Id the panel was built and positioned for; reset to rebuild (new selection, move, drop). */
  let panelFor: string | undefined
  const panelValues = new Map<string, HTMLSpanElement>()

  function stepper(key: string, label: string, onDec: () => void, onInc: () => void): HTMLElement {
    const row = el('div', 'row')
    const dec = el('button', 'btn small', '−')
    const inc = el('button', 'btn small', '+')
    const value = el('span', 'value')
    dec.addEventListener('click', onDec)
    inc.addEventListener('click', onInc)
    row.append(el('span', 'label', label), dec, value, inc)
    panelValues.set(key, value)
    return row
  }

  /** An icon-only button; the action name is its tooltip and its accessible name. */
  function iconButton(name: IconName, action: string, run: () => void): HTMLButtonElement {
    const b = el('button', name === 'delete' ? 'btn icon danger' : 'btn icon')
    b.type = 'button'
    b.title = t(`action.${action}`)
    b.setAttribute('aria-label', b.title)
    b.append(icon(name))
    b.addEventListener('click', run)
    return b
  }

  /** The action row of the selection. */
  function actionRow(one: Placement | undefined): HTMLElement {
    const row = el('div', 'row actions')
    if (!one) row.append(el('span', 'count', String(selection.length)))
    row.append(iconButton('duplicate', 'duplicate', duplicateSelection), iconButton('copy', 'copy', copySelection))
    if (one ? partDef(one.kind).rotStep > 0 : unlocked().length > 1) row.append(iconButton('rotate', 'rotate', () => rotateSelection(1)))
    if (one && partDef(one.kind).flippable) row.append(iconButton('flip', 'flip', () => edit(flipped)))
    if (author) row.append(lockButton())
    row.append(iconButton('delete', 'delete', removeSelected))
    return row
  }

  const lockButton = (): HTMLButtonElement => iconButton(allLocked() ? 'unlock' : 'lock', allLocked() ? 'unlock' : 'lock', toggleLock)

  /** Builds the panel's buttons once per selection; they read the part at click time. */
  function buildSelPanel(p: Placement): void {
    const def = partDef(p.kind)
    panelValues.clear()
    selPanel.classList.remove('bar')
    selPanel.replaceChildren(el('div', 'title', partLabel(p.kind)))
    // rotation and length live on the part's own handles
    for (const s of def.settings.filter((d) => d.key !== 'length')) {
      const by = (d: number) => () => edit((q) => withSetting(q, s.key, setting(q, s) + d * s.step))
      selPanel.append(stepper(s.key, settingLabel(s), by(-1), by(1)))
    }
    selPanel.append(actionRow(p))
  }

  /** Several parts: just the count and the actions, above the selection box. */
  function buildGroupPanel(): void {
    panelValues.clear()
    selPanel.classList.add('bar')
    selPanel.replaceChildren(actionRow(undefined))
  }

  /** Only locked parts selected: nothing to do with them but unlock. */
  function buildLockedPanel(): void {
    panelValues.clear()
    selPanel.classList.add('bar')
    const row = el('div', 'row actions')
    row.append(lockButton())
    selPanel.replaceChildren(row)
  }

  function updateSelValues(p: Placement): void {
    panelValues.get('rot')?.replaceChildren(`${p.rot * 15}°`)
    for (const s of partDef(p.kind).settings) panelValues.get(s.key)?.replaceChildren(String(setting(p, s)))
  }

  const selectedLinkObj = () => sol.links.find((l) => l.id === selectedLink)

  function buildLinkPanel(kind: 'rope' | 'belt'): void {
    panelValues.clear()
    selPanel.classList.remove('bar')
    const del = el('button', 'btn small danger', t('panel.remove'))
    del.addEventListener('click', removeSelected)
    const actions = el('div', 'row')
    actions.append(del)
    selPanel.replaceChildren(el('div', 'title', kind === 'rope' ? t('tool.rope') : t('tool.belt')), actions)
  }

  /** Link panel, next to the link's midpoint. */
  function refreshLinkPanel(): boolean {
    const l = selectedLinkObj()
    if (!l || sim) return false
    const a = anchorAt(level, sol, l.a)
    const b = anchorAt(level, sol, l.b)
    if (!a || !b) return false
    const key = `link:${l.id}`
    if (panelFor !== key) {
      buildLinkPanel(l.kind)
      selPanel.hidden = false
      const anchor = unitsToClient({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, canvas.getBoundingClientRect())
      const at = panelPosition(anchor, stage.getBoundingClientRect(), { w: selPanel.offsetWidth, h: selPanel.offsetHeight })
      selPanel.style.left = `${at.x}px`
      selPanel.style.top = `${at.y}px`
      panelFor = key
    }
    selPanel.hidden = false
    return true
  }

  /**
   * Built and positioned when the selection changes or after a move; edits only update the values,
   * so the buttons stay put under the pointer while the part grows or rotates.
   */
  function refreshSelPanel(): void {
    if (!drag?.started && refreshLinkPanel()) return
    if (author && allLocked() && !sim && !drag?.started && !group?.started) {
      const key = `locked:${selection.join(',')}`
      if (panelFor !== key) buildLockedPanel()
      selPanel.hidden = false
      panelFor = key
      positionGroupPanel()
      return
    }
    const p = single()
    if (!p && selection.length > 1) {
      if (sim || drag?.started || group?.started || spin?.moved) {
        selPanel.hidden = true
        return
      }
      const key = `group:${selection.join(',')}`
      if (panelFor !== key) buildGroupPanel()
      selPanel.hidden = false
      panelFor = key
      positionGroupPanel()
      return
    }
    if (!p || drag?.started) panelFor = undefined
    if (!p || sim || drag?.started) {
      selPanel.hidden = true
      return
    }
    const fresh = panelFor !== p.id
    if (fresh) buildSelPanel(p)
    updateSelValues(p)
    selPanel.hidden = false
    if (fresh) positionSelPanel(p)
    panelFor = p.id
  }

  /** Above the selection box (8 units of padding included), below it when there is no room. */
  function positionGroupPanel(): void {
    const box = groupBox(sol.placements.filter((p) => selection.includes(p.id)))
    const r = canvas.getBoundingClientRect()
    const stageRect = stage.getBoundingClientRect()
    // above the rotate handle too, so the panel never covers it
    const handle = groupHandle()
    const top = unitsToClient({ x: box.x - 8, y: handle ? Math.min(box.y - 8, handle.y - HANDLE_HIT) : box.y - 8 }, r)
    const bottom = unitsToClient({ x: box.x - 8, y: box.y + box.h + 8 }, r)
    const h = selPanel.offsetHeight
    const room = top.y - stageRect.top - h - 6 >= 8
    const anchor = { x: top.x, y: room ? top.y - h - 6 : bottom.y + 6 }
    const at = panelPosition(anchor, stageRect, { w: selPanel.offsetWidth, h }, 0)
    selPanel.style.left = `${at.x}px`
    selPanel.style.top = `${at.y}px`
  }

  function positionSelPanel(p: Placement): void {
    // right of the part and of its handles, so the panel never covers a handle
    const pts = [...footprint(p), ...Object.values(handlesOf(p))]
    const anchor = unitsToClient({ x: Math.max(...pts.map((q) => q.x)) + 12, y: Math.min(...pts.map((q) => q.y)) }, canvas.getBoundingClientRect())
    const at = panelPosition(anchor, stage.getBoundingClientRect(), { w: selPanel.offsetWidth, h: selPanel.offsetHeight })
    selPanel.style.left = `${at.x}px`
    selPanel.style.top = `${at.y}px`
  }

  // ---- edits ----
  function showToast(text: string, ms = 1200): void {
    toast.textContent = text
    toast.classList.add('show')
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), ms)
  }

  /** Solutions before (past) and after (future) the current one; a new edit clears the future. */
  const past: Solution[] = []
  let future: Solution[] = []
  const HISTORY_MAX = 100

  /** Every edit goes through `commit`; `record` false folds it into the previous step (a handle drag). */
  function commit(next: Solution, record = true): void {
    if (record) {
      past.push(sol)
      if (past.length > HISTORY_MAX) past.shift()
      future = []
    }
    apply(next)
  }

  function undo(): void {
    const prev = past.pop()
    if (!prev || sim) return
    future.push(sol)
    sound.click()
    apply(prev)
  }

  function redo(): void {
    const next = future.pop()
    if (!next || sim) return
    past.push(sol)
    sound.click()
    apply(next)
  }

  /** Sets the solution, drops a selection or pending link that no longer exists, and saves. */
  function apply(next: Solution): void {
    sol = next
    selection = selection.filter((id) => sol.placements.some((p) => p.id === id))
    if (selectedLink && !sol.links.some((l) => l.id === selectedLink)) selectedLink = undefined
    if (first && !partExists(first.part)) first = undefined
    if (author) author.onChange(sol)
    else saveDraft(level.id, sol)
    refreshUi()
  }

  const partExists = (id: string): boolean => sol.placements.some((p) => p.id === id) || level.fixed.some((p) => p.id === id)

  function targets(): Anchor[] | undefined {
    if (!tool) return undefined
    const c = targetsCache
    if (c && c.tool === tool && c.first === first && c.sol === sol) return c.list
    targetsCache = { tool, first, sol, list: linkTargets(level, sol, tool, first) }
    return targetsCache.list
  }

  function edit(fn: (p: Placement) => Placement | null): void {
    const p = single()
    if (!p || sim || isLocked(p.id)) return
    const np = fn(p)
    if (!np) return
    const r = updatePart(level, sol, np)
    if (r) {
      sound.click()
      commit(r)
    }
    else showToast(t('toast.noRoom'))
  }

  function removeSelected(): void {
    if (sim) return
    sound.click()
    if (selectedLink) {
      const id = selectedLink
      selectedLink = undefined
      commit(removeLink(sol, id))
      return
    }
    const ids = unlocked()
    if (!ids.length) return
    selection = selection.filter(isLocked)
    commit(removeGroup(sol, ids))
  }

  /** Moves the whole selection by a snapped offset, as one undo step; "no room" when it does not fit. */
  function nudge(dx: number, dy: number): void {
    const ids = unlocked()
    if (sim || !ids.length) return
    const next = moveGroup(level, sol, ids, dx, dy)
    if (!next) {
      showToast(t('toast.noRoom'))
      return
    }
    sound.click()
    const dropped = sol.links.length - next.links.length
    commit(next)
    if (dropped > 0) showToast(t('toast.beltDropped'))
  }

  /** Parts that turn with the group's rotate handle: the unlocked ones, when there are several. */
  function spinParts(): Placement[] | undefined {
    const ids = unlocked()
    if (sim || tool || selection.length < 2 || ids.length < 2) return undefined
    return sol.placements.filter((p) => ids.includes(p.id))
  }

  /** The group's rotate handle, when the selection can turn. */
  function groupHandle(): Vec | undefined {
    const ps = spinParts()
    return ps && groupRotHandle(groupBox(ps))
  }

  /** Centre of the group's box on the grid, so quarter turns keep the parts on it. */
  const spinPivot = (ps: Placement[]): Vec => {
    const box = groupBox(ps)
    return v(snap(box.x + box.w / 2), snap(box.y + box.h / 2))
  }

  /** One notch of the selection (dir 1 = clockwise): the part's own step, or the group's around its centre. */
  function rotateSelection(dir: 1 | -1): void {
    const ps = spinParts()
    if (!ps) {
      edit((p) => rotated(p, dir))
      return
    }
    const next = rotateGroup(level, sol, ps.map((p) => p.id), dir * groupRotStep(ps), spinPivot(ps))
    if (!next) {
      showToast(t('toast.noRoom'))
      return
    }
    sound.click()
    const dropped = sol.links.length - next.links.length
    commit(next)
    if (dropped > 0) showToast(t('toast.beltDropped'))
  }

  function selectAll(): void {
    selection = sol.placements.filter((p) => !isLocked(p.id)).map((p) => p.id)
    selectedLink = undefined
    tool = undefined
    first = undefined
    refreshUi()
  }

  /** Copies the selected parts (and the links between them) to the clipboard. */
  function copySelection(): void {
    const ids = unlocked()
    if (sim || !ids.length) return
    setClip(copyGroup(sol, ids))
  }

  /** Pastes a clip as one undo step and selects the copies; the toast says why when it does not fit. */
  function pasteInto(clip: Clip, centre: Vec, prefer: 'at' | 'right'): void {
    if (sim) return
    const left = remaining(level, sol)
    const need = new Map<PartKind, number>()
    for (const p of clip.placements) need.set(p.kind, (need.get(p.kind) ?? 0) + 1)
    const short = [...need].some(([kind, n]) => (left.get(kind) ?? 0) < n)
    const r = pasteClip(level, sol, clip, centre, prefer)
    if (!r) {
      showToast(t(short ? 'toast.notEnoughParts' : 'toast.noRoom'))
      return
    }
    sound.click()
    selectedLink = undefined
    selection = r.ids
    commit(r.sol)
  }

  function duplicateSelection(): void {
    const ids = unlocked()
    if (sim || !ids.length) return
    const box = groupBox(sol.placements.filter((p) => ids.includes(p.id)))
    pasteInto(copyGroup(sol, ids), v(box.x + box.w / 2, box.y + box.h / 2), 'right')
  }

  /** Pastes at `at` (the pointer or the click), else where the copy came from. */
  function pasteClipboard(at: Vec | undefined): void {
    const clip = getClip()
    if (!clip || sim) return
    const box = groupBox(clip.placements)
    pasteInto(clip, at ?? v(box.x + box.w / 2, box.y + box.h / 2), 'at')
  }

  let closeMenu: (() => void) | undefined
  const modKey = isMac() ? 'Cmd+' : 'Ctrl+'

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    closeMenu?.()
    if (sim) return
    const pt = unitsAt(e)
    const hit = hitPart(sol, pt)
    let items: MenuItem[]
    if (hit) {
      selectedLink = undefined
      if (!selection.includes(hit.id)) selection = [hit.id]
      refreshUi()
      const one = single()
      items = [
        { label: t('menu.copy'), shortcut: `${modKey}C`, run: copySelection, enabled: unlocked().length > 0 },
        { label: t('menu.duplicate'), shortcut: `${modKey}D`, run: duplicateSelection, enabled: unlocked().length > 0 },
        { label: t('menu.rotate'), shortcut: 'R', run: () => rotateSelection(1), enabled: one ? !isLocked(one.id) && partDef(one.kind).rotStep > 0 : !!spinParts() },
        { label: t('menu.flip'), shortcut: 'F', run: () => edit(flipped), enabled: !!one && !isLocked(one.id) && partDef(one.kind).flippable },
        ...(author ? [{ label: t(allLocked() ? 'action.unlock' : 'action.lock'), shortcut: 'L', run: toggleLock, enabled: true }] : []),
        { label: t('menu.delete'), shortcut: 'Del', run: removeSelected, enabled: unlocked().length > 0 },
      ]
    } else {
      items = [
        { label: t('menu.pasteHere'), shortcut: `${modKey}V`, run: () => pasteClipboard(pt), enabled: !!getClip() },
        { label: t('menu.selectAll'), shortcut: `${modKey}A`, run: selectAll, enabled: sol.placements.length > 0 },
      ]
    }
    closeMenu = openMenu({ x: e.clientX, y: e.clientY }, items)
  })

  zoneTag.addEventListener('click', () => {
    const zi = zoneIndex()
    const g = author?.goals()[zi]
    if (!author || g?.type !== 'inZone') return
    closeMenu?.()
    const r = zoneTag.getBoundingClientRect()
    const items: MenuItem[] = sol.placements.map((p) => ({
      label: `${partLabel(p.kind)} (${p.id})`,
      shortcut: '',
      enabled: true,
      current: p.id === g.part,
      run: () => {
        author.setGoalPart(zi, p.id)
        // setGoalPart replaces the goal object
        selectedGoal = author.goals()[zi]
        refreshUi()
      },
    }))
    closeMenu = openMenu({ x: r.left, y: r.bottom }, items)
  })

  /** A hint as key caps followed by its label. */
  function hintNode(hint: Hint): HTMLElement {
    const item = el('span', 'hint')
    hint.keys.forEach((k, i) => {
      if (i) item.append('+')
      item.append(el('kbd', '', k))
    })
    item.append(` ${hint.label}`)
    return item
  }

  function refreshHints(): void {
    // hidden but still taking room, so the board does not jump when the machine starts
    hints.style.visibility = sim ? 'hidden' : ''
    if (sim) {
      closeHelp()
      return
    }
    const list = hintsFor({
      author: !!author,
      count: selection.length,
      single: !!single(),
      allLocked: allLocked(),
      zone: zoneIndex() >= 0,
      clip: !!getClip(),
      mac: isMac(),
    })
    const more = el('button', 'hint more')
    more.append(el('kbd', '', '?'), ` ${t('hint.all.link')}`)
    more.addEventListener('click', openHelp)
    // on a narrow board the list gives way, the link to the full help stays
    const items = el('span', 'items')
    items.append(...list.map(hintNode))
    hints.replaceChildren(items, more)
  }

  function openHelp(): void {
    const rows = allShortcuts(!!author, isMac()).map((hint) => {
      const row = el('div', 'row')
      row.append(el('span', 'keys'), el('span', 'what', hint.label))
      row.firstElementChild!.replaceChildren(...hint.keys.flatMap((k, i) => (i ? ['+', el('kbd', '', k)] : [el('kbd', '', k)])))
      return row
    })
    const card = el('div', 'card')
    card.append(el('h2', '', t('help.title')), ...rows, el('p', 'note', t('help.close')))
    help.replaceChildren(card)
    help.hidden = false
  }

  function closeHelp(): void {
    help.hidden = true
  }

  function refreshUi(): void {
    dirty = true
    // a zone stays selected only while its goal is there (the panel can remove it) and nothing else is
    if (selectedGoal && (selection.length || selectedLink || zoneIndex() < 0)) selectedGoal = undefined
    if (author && selectedGoal !== notifiedGoal) {
      notifiedGoal = selectedGoal
      author.onSelectGoal(selectedGoal)
    }
    refreshHints()
    undoBtn.disabled = !past.length || !!sim
    redoBtn.disabled = !future.length || !!sim
    refreshDrawer()
    refreshSelPanel()
    canvas.classList.toggle('dragging', !!drag?.started || !!group?.started)
    for (const [lt, b] of toolButtons) b.classList.toggle('on', lt === tool)
    canvas.classList.toggle('linking', !!tool)
  }

  // ---- pointer ----
  const unitsAt = (e: { clientX: number; clientY: number }): Vec => clientToUnits(e.clientX, e.clientY, canvas.getBoundingClientRect())

  function updateDrag(e: PointerEvent): void {
    if (!drag) return
    if (!drag.started) {
      const dx = e.clientX - drag.start.x
      const dy = e.clientY - drag.start.y
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return
      drag.started = true
      refreshSelPanel()
    }
    const pt = unitsAt(e)
    if (!insideField(pt)) {
      drag.ghost = undefined
      drag.ok = false
      return
    }
    const at = { x: pt.x + drag.offset.x, y: pt.y + drag.offset.y }
    const base = drag.moving ?? drawerDefaults(level, sol, draftPlacement(drag.kind, at, drag.id))
    let ghost = { ...draftPlacement(drag.kind, at, drag.id), rot: base.rot, flip: base.flip, settings: base.settings }
    const r = gearRadius(drag.kind)
    const others = r === undefined ? [] : [...level.fixed, ...sol.placements].filter((p) => p.id !== drag!.id)
    // Gears snap onto a neighbour's pitch circle when close enough, else keep the grid.
    if (r !== undefined) ghost = gearMagnet(ghost, at, others) ?? ghost
    drag.ghost = ghost
    drag.ok = (drag.moving ? updatePart(level, sol, ghost) : addPart(level, sol, ghost)) !== null
    drag.meshMarks = r !== undefined && drag.ok ? meshMarks({ x: ghost.x, y: ghost.y, r }, others) : undefined
  }

  /** Where the ghost gear touches each gear it meshes with: on the other gear's circle, towards the ghost. */
  function meshMarks(g: { x: number; y: number; r: number }, others: Placement[]): Vec[] {
    const out: Vec[] = []
    for (const o of others) {
      const ro = gearRadius(o.kind)
      if (ro === undefined || !gearsMesh(g, { x: o.x, y: o.y, r: ro })) continue
      const dx = g.x - o.x
      const dy = g.y - o.y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d === 0) continue
      out.push({ x: o.x + (dx * ro) / d, y: o.y + (dy * ro) / d })
    }
    return out
  }

  /** Link tool click: a part's anchor, then a second one; a click in the void steps back. */
  function linkClick(lt: LinkTool, pt: Vec): void {
    const part = hitAnyPart(level, sol, pt)
    if (!part) {
      first = undefined
      tool = undefined
      return
    }
    const a = pickAnchor(targets() ?? [], part, level, sol, pt)
    if (!a) {
      const takes = partDef(part.kind).anchors.some((d) => d.role === lt)
      showToast(takes ? t('toast.cannotLink') : t(lt === 'rope' ? 'toast.noRope' : 'toast.noBelt'))
      return
    }
    if (!first) {
      first = a
      return
    }
    const next = addLink(level, sol, first, a)
    first = undefined
    if (next) {
      sound.click()
      commit(next)
    } else showToast(t('toast.cannotLink'))
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || sim) return
    const pt = unitsAt(e)
    if (author?.tracing()) {
      e.preventDefault()
      trace = { a: pt, b: pt }
      hover = undefined
      tool = undefined
      first = undefined
      refreshUi()
      return
    }
    if (tool) {
      e.preventDefault()
      linkClick(tool, pt)
      refreshUi()
      return
    }
    const gh = groupHandle()
    if (gh && len(sub(gh, pt)) <= HANDLE_HIT) {
      e.preventDefault()
      const ps = spinParts()!
      const pivot = spinPivot(ps)
      spin = { ids: ps.map((p) => p.id), base: sol, pivot, radius: Math.max(40, len(sub(gh, pivot))), step: groupRotStep(ps), start: { x: e.clientX, y: e.clientY }, moved: false, notches: 0, turned: ps, next: sol, blockers: [], valid: sol }
      refreshUi()
      return
    }
    const sp = single()
    const handle = sp && !isLocked(sp.id) && hitHandle(sp, pt)
    if (handle) {
      e.preventDefault()
      grip = { kind: handle, start: { x: e.clientX, y: e.clientY }, moved: false }
      refreshUi()
      return
    }
    const hit = hitPart(sol, pt)
    if (hit) {
      e.preventDefault()
      selectedLink = undefined
      selectedGoal = undefined
      if (e.shiftKey) {
        selection = selection.includes(hit.id) ? selection.filter((id) => id !== hit.id) : [...selection, hit.id]
      } else {
        if (!selection.includes(hit.id)) selection = [hit.id]
        const start = { x: e.clientX, y: e.clientY }
        const ids = unlocked()
        // a locked part is selected by the click but does not move
        if (selection.length === 1) {
          if (ids.length) drag = { kind: hit.kind, moving: hit, id: hit.id, offset: { x: hit.x - pt.x, y: hit.y - pt.y }, start, started: false, ok: false }
        } else if (ids.length && !isLocked(hit.id)) group = { ids, pressed: hit.id, start, from: pt, started: false, dx: 0, dy: 0, next: sol, guides: [] }
      }
      refreshUi()
      return
    }
    const zones = author?.goals() ?? []
    const zsel = zoneIndex()
    const zone = zsel >= 0 ? zones[zsel] : undefined
    const corner = zone?.type === 'inZone' ? zoneCorner(zone.zone, pt, HANDLE_HIT) : undefined
    if (author && zsel >= 0 && zone?.type === 'inZone' && corner) {
      e.preventDefault()
      zoneDrag = { i: zsel, corner, orig: zone.zone, from: pt, start: { x: e.clientX, y: e.clientY }, started: false }
      refreshUi()
      return
    }
    const link = hitLink(level, sol, pt)
    if (link) {
      selection = []
      selectedGoal = undefined
      selectedLink = link
      refreshUi()
      return
    }
    const zi = author ? zoneAt(zones, pt) : undefined
    const hitZone = zi !== undefined ? zones[zi] : undefined
    if (zi !== undefined && hitZone?.type === 'inZone') {
      e.preventDefault()
      selection = []
      selectedLink = undefined
      selectedGoal = hitZone
      zoneDrag = { i: zi, orig: hitZone.zone, from: pt, start: { x: e.clientX, y: e.clientY }, started: false }
      refreshUi()
      return
    }
    // empty space: a selection rectangle, added to the current selection with Shift
    e.preventDefault()
    selectedLink = undefined
    selectedGoal = undefined
    const base = e.shiftKey ? selection : []
    selection = base
    marquee = { a: pt, b: pt, base }
    refreshUi()
  })

  /** Selection under the rectangle: the kept base plus every part it touches. */
  function updateMarquee(m: NonNullable<typeof marquee>, pt: Vec): void {
    m.b = pt
    selection = [...m.base, ...selectInRect(level, sol, rectBetween(m.a, m.b), new Set([...m.base, ...(author?.locked() ?? [])]))]
  }

  /** Zone drag: the zone follows the pointer, live through the editor (the model owns it, no undo step). */
  function updateZone(z: ZoneDrag, e: PointerEvent): void {
    if (!author) return
    if (!z.started) {
      const dx = e.clientX - z.start.x
      const dy = e.clientY - z.start.y
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return
      z.started = true
    }
    const pt = unitsAt(e)
    const next = z.corner ? resizeZone(z.orig, z.corner, pt) : moveZone(z.orig, pt.x - z.from.x, pt.y - z.from.y)
    const g = author.goals()[z.i]
    if (g?.type === 'inZone' && (g.zone.x !== next.x || g.zone.y !== next.y || g.zone.w !== next.w || g.zone.h !== next.h)) {
      author.setZone(z.i, next)
      // setZone replaces the goal object
      selectedGoal = author.goals()[z.i]
    }
    dirty = true
  }

  /** Group drag: snapped offset from the press point, the moved solution if it fits, and the guides. */
  function updateGroup(g: GroupDrag, e: PointerEvent): void {
    if (!g.started) {
      const dx = e.clientX - g.start.x
      const dy = e.clientY - g.start.y
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return
      g.started = true
      hover = undefined
      refreshUi()
    }
    const pt = unitsAt(e)
    g.dx = snap(pt.x - g.from.x)
    g.dy = snap(pt.y - g.from.y)
    g.next = moveGroup(level, sol, g.ids, g.dx, g.dy)
    const ids = new Set(g.ids)
    g.guides = guidesFor(movedParts(g), [...level.fixed, ...sol.placements].filter((p) => !ids.has(p.id)))
  }

  /** The group's parts at their dragged position. */
  function movedParts(g: GroupDrag): Placement[] {
    const ids = new Set(g.ids)
    return sol.placements.filter((p) => ids.has(p.id)).map((p) => ({ ...p, x: p.x + g.dx, y: p.y + g.dy }))
  }

  function onPointerMove(e: PointerEvent): void {
    if (trace) {
      trace.b = unitsAt(e)
      return
    }
    if (marquee) {
      updateMarquee(marquee, unitsAt(e))
      return
    }
    if (zoneDrag) {
      updateZone(zoneDrag, e)
      return
    }
    if (group) {
      updateGroup(group, e)
      return
    }
    if (e.target === canvas) pointer = unitsAt(e)
    if (spin) {
      moveSpin(spin, e)
      return
    }
    if (grip) {
      moveGrip(grip, e)
      return
    }
    if (drag) {
      updateDrag(e)
      canvas.classList.toggle('dragging', drag.started)
      if (drag.started) hover = undefined
      return
    }
    if (!sim && e.target === canvas) {
      const pt = unitsAt(e)
      const over = hitAnyPart(level, sol, pt)
      if (over?.id !== hover?.id) hover = over ? { id: over.id, since: performance.now() } : undefined
      canvas.classList.toggle('tracing', !!author?.tracing())
      const sp = !tool ? single() : undefined
      const handle = sp && !isLocked(sp.id) && hitHandle(sp, pt)
      const end = handle === 'start' || handle === 'end' ? handle : undefined
      if (end !== hoverEnd?.end) hoverEnd = end ? { end, since: performance.now() } : undefined
      const gh = !tool ? groupHandle() : undefined
      const overSpin = !!gh && len(sub(gh, pt)) <= HANDLE_HIT
      canvas.classList.toggle('over-rot', handle === 'rot' || overSpin)
      canvas.classList.toggle('over-end', !!end)
      const clickable = tool ? !!over : !!(handle || overSpin || hitPart(sol, pt) || hitLink(level, sol, pt))
      canvas.classList.toggle('over-part', !author?.tracing() && clickable)
    }
  }

  /** Rotates or resizes the selected part from a handle drag, once past the drag threshold. */
  function moveGrip(g: NonNullable<typeof grip>, e: PointerEvent): void {
    const p = single()
    if (!p) return
    const dx = e.clientX - g.start.x
    const dy = e.clientY - g.start.y
    if (!g.moved && dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return
    g.moved = true
    hover = undefined
    const pt = unitsAt(e)
    if (g.kind === 'rot') g.free = freeAngle(p, pt)
    const np = g.kind === 'rot' ? rotateToward(p, pt) : resizeToward(p, g.kind, pt)
    const r = np && updatePart(level, sol, np)
    if (r) {
      sound.click()
      // one undo step per drag, however many notches or cells it went through
      commit(r, !g.recorded)
      g.recorded = true
    }
    dirty = true
  }

  /** Ghost of the group turned toward the pointer, once past the drag threshold; the last pose that fits is kept for the release. */
  function moveSpin(g: NonNullable<typeof spin>, e: PointerEvent): void {
    const dx = e.clientX - g.start.x
    const dy = e.clientY - g.start.y
    if (!g.moved) {
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return
      g.moved = true
      // the panel hides while the group turns
      refreshUi()
    }
    hover = undefined
    const pt = unitsAt(e)
    g.free = Math.atan2(pt.y - g.pivot.y, pt.x - g.pivot.x) + Math.PI / 2
    const n = groupNotches(g.pivot, pt, g.step)
    if (n !== g.notches) {
      g.notches = n
      g.turned = turnedParts(g.base, g.ids, n, g.pivot)
      g.next = rotateGroup(level, g.base, g.ids, n, g.pivot)
      g.blockers = g.next ? [] : rotationBlockers(level, g.base, g.turned)
      if (g.next) {
        sound.click()
        g.valid = g.next
      }
    }
    dirty = true
  }

  function onPointerLeave(): void {
    hoverEnd = undefined
    hover = undefined
    pointer = undefined
    dirty = true
  }

  function onPointerUp(e: PointerEvent): void {
    if (trace) {
      const zone = rectFromDrag(trace.a, unitsAt(e))
      trace = undefined
      if (!author?.tracing()) return
      if (zone) author.onTraced(zone)
      else showToast(t('toast.zoneTooSmall'))
      return
    }
    if (zoneDrag) {
      updateZone(zoneDrag, e)
      zoneDrag = undefined
      refreshUi()
      return
    }
    if (spin) {
      const g = spin
      spin = undefined
      // a click turns one notch clockwise; a drag released where the group does not fit lands on the last pose that did
      if (!g.moved) rotateSelection(1)
      else {
        if (!g.next) showToast(t('toast.noRoom'))
        if (g.valid !== g.base) {
          // one undo step per drag, however many notches it went through
          commit(g.valid)
          if (g.valid.links.length < g.base.links.length) showToast(t('toast.beltDropped'))
        }
      }
      refreshUi()
      return
    }
    if (grip) {
      const g = grip
      grip = undefined
      // a click steps once: one notch clockwise, or one cell longer on that end
      if (!g.moved) edit((q) => (g.kind === 'rot' ? rotated(q, 1) : grow(q, g.kind, 1)))
      refreshUi()
      const sp = single()
      if (sp && !selPanel.hidden) positionSelPanel(sp)
      return
    }
    if (marquee) {
      updateMarquee(marquee, unitsAt(e))
      marquee = undefined
      refreshUi()
      return
    }
    if (group) {
      const g = group
      group = undefined
      if (!g.started) selection = [g.pressed]
      else {
        updateGroup(g, e)
        if (!g.next) showToast(t('toast.noRoom'))
        else if (g.dx !== 0 || g.dy !== 0) {
          sound.click()
          const dropped = sol.links.length - g.next.links.length
          commit(g.next)
          if (dropped > 0) showToast(t('toast.beltDropped'))
        }
      }
      refreshUi()
      return
    }
    const d = drag
    if (!d) return
    drag = undefined
    if (d.started) {
      updateDrag(e)
      if (d.ghost && d.ok) {
        sound.click()
        const next = (d.moving ? updatePart(level, sol, d.ghost) : addPart(level, sol, d.ghost))!
        const dropped = sol.links.length - next.links.length
        commit(next)
        if (d.moving && dropped > 0) showToast(t('toast.beltDropped'))
        selection = [d.id]
      } else if (d.moving && drawer.contains(e.target as Node)) {
        selection = []
        sound.click()
        commit(removePart(sol, d.id))
      } else if (d.ghost) {
        showToast(t('toast.noRoom'))
      }
    }
    refreshUi()
  }

  // ---- run / stop ----
  function start(): void {
    if (sim || author) return
    closeMenu?.()
    stall = createStallWatch()
    drag = undefined
    group = undefined
    marquee = undefined
    tool = undefined
    first = undefined
    hover = undefined
    // Always a fresh Simulation from the saved solution: nothing is carried over between runs.
    sim = new Simulation(level, sol)
    prevGlow = new Map()
    sound.click()
    won = false
    acc = 0
    lastT = undefined
    screen.classList.add('running')
    launch.textContent = t('play.stop')
    refreshUi()
  }

  function stop(): void {
    sound.stopLoops()
    showRetry(undefined)
    sim = undefined
    won = false
    winPanel.hidden = true
    screen.classList.remove('running')
    launch.textContent = t('play.run')
    refreshUi()
  }

  const toggle = (): void => (sim ? stop() : start())

  /**
   * Whether some body's centre is travelling (wheels and gears turning in place do not count), at
   * all and on the board: a ball that fell out of view keeps moving but will not come back.
   */
  function travelling(s: Simulation): { any: boolean; onBoard: boolean } {
    const moving = s.world.bodies().filter((b) => b.isDynamic() && b.isActive()).map((b) => {
      const u = velocity(b)
      return { speed: Math.sqrt(u.x * u.x + u.y * u.y), at: bodyPose(b) }
    })
    const onBoard = moving.filter(({ at }) => at.x >= 0 && at.x <= FIELD.w && at.y >= 0 && at.y <= FIELD.h)
    return { any: anyMoving(moving.map((m) => m.speed)), onBoard: anyMoving(onBoard.map((m) => m.speed)) }
  }

  function showRetry(reason: StallReason | undefined): void {
    retry.hidden = !reason
    if (reason) retryText.textContent = t(reason === 'still' ? 'retry.still' : 'retry.long')
  }

  function onGoalsMet(): void {
    showRetry(undefined)
    won = true
    sound.win()
    markSolved(level.id)
    opts.onSolved?.(sol)
    winPanel.hidden = false
  }

  launch.addEventListener('click', () => {
    launch.blur()
    toggle()
  })
  back.addEventListener('click', () => opts.onBack())
  next.addEventListener('click', () => opts.onWin())
  replay.addEventListener('click', stop)

  function onKey(e: KeyboardEvent): void {
    if (isTypingTarget(e.target)) return
    // while the help is shown, only Escape and ? act: the board behind must not react
    if (!help.hidden) {
      if (e.key === 'Escape' || e.key === '?') closeHelp()
      if (!e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault()
      return
    }
    if (e.code === 'Space') {
      e.preventDefault()
      if (!e.repeat) toggle()
      return
    }
    if (sim) return
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      openHelp()
      return
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) {
      e.preventDefault()
      if (e.key === 'y' || e.shiftKey) redo()
      else undo()
      return
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault()
      selectAll()
      return
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'c' || e.key === 'C')) {
      // plain text copy keeps working when no part is selected
      if (unlocked().length > 0) e.preventDefault()
      copySelection()
      return
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault()
      duplicateSelection()
      return
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault()
      pasteClipboard(pointer)
      return
    }
    // Leave browser and system shortcuts (Ctrl+R, Cmd+F, Alt+Backspace…) alone.
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (author && (e.key === 'l' || e.key === 'L')) toggleLock()
    else if (e.key === 'r' || e.key === 'R') rotateSelection(e.shiftKey ? -1 : 1)
    else if (e.key === 'f' || e.key === 'F') edit(flipped)
    else if (author && selectedGoal && !selection.length && (e.key in ARROWS || e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault()
      const zi = zoneIndex()
      const g = author.goals()[zi]
      if (g?.type !== 'inZone') selectedGoal = undefined
      else if (e.key in ARROWS) {
        const [x, y] = ARROWS[e.key]
        const step = e.shiftKey ? NUDGE_STEP_BIG : NUDGE_STEP
        author.setZone(zi, moveZone(g.zone, x * step, y * step))
        selectedGoal = author.goals()[zi]
      } else {
        selectedGoal = undefined
        author.removeGoal(zi)
      }
      refreshUi()
    } else if (e.key in ARROWS && selection.length) {
      e.preventDefault()
      const [x, y] = ARROWS[e.key]
      const step = e.shiftKey ? NUDGE_STEP_BIG : NUDGE_STEP
      nudge(x * step, y * step)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      removeSelected()
    } else if (e.key === 'Escape') {
      // a drag in progress is cancelled: the zone goes back where it was, the group never moved or turned
      if (zoneDrag && author) author.setZone(zoneDrag.i, zoneDrag.orig)
      group = undefined
      spin = undefined
      trace = undefined
      marquee = undefined
      zoneDrag = undefined
      selection = []
      selectedGoal = undefined
      selectedLink = undefined
      tool = undefined
      first = undefined
      refreshUi()
      for (const b of toolButtons.values()) b.blur()
    }
  }
  /** Stops a focused button from also "clicking" on Space keyup. */
  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space') e.preventDefault()
  }

  // ---- sizing & frame loop ----
  function resize(): void {
    fit = fitCanvas(stage.clientWidth - 16, stage.clientHeight - 16 - HINTS_H, window.devicePixelRatio || 1)
    canvas.style.width = `${fit.cssW}px`
    canvas.style.height = `${fit.cssH}px`
    hints.style.width = `${fit.cssW}px`
    canvas.width = fit.pxW
    canvas.height = fit.pxH
    dirty = true
    const p = single()
    if (p && !selPanel.hidden) positionSelPanel(p)
    else if (!selPanel.hidden && selection.length > 1) positionGroupPanel()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(stage)

  /** Sound only reads the sim after a step: new impacts and parts whose glow just jumped. */
  function listen(s: Simulation): void {
    const kindOf = (b: Parameters<typeof data>[0]): PartKind | undefined => {
      const id = data(b).part
      return id === null ? undefined : s.parts.find((p) => p.id === id)?.kind
    }
    const hit = impacts(s.lastContacts.filter((c) => !c.began).map((c) => {
      const a = bodyId(c.a)
      const b = bodyId(c.b)
      return { key: a < b ? `${a}:${b}` : `${b}:${a}`, impulse: c.impulse, kinds: [kindOf(c.a), kindOf(c.b)] }
    }))
    if (hit) sound.impact(impactVoice(hit.kinds), hit.impulse)
    for (const p of startedParts(prevGlow, s.parts)) sound.activate(p.kind)
    sound.setLoops(activeLoops(s.parts))
    prevGlow = new Map(s.parts.map((p) => [p.id, p.glow]))
  }

  /** A step or a draw threw: stop the run, say so, keep the loop alive (drawing errors are logged once). */
  let drawFailed = false
  function jammed(err: unknown, fromDraw: boolean): void {
    if (!fromDraw || !drawFailed || sim) console.error(err)
    if (fromDraw) drawFailed = true
    if (sim) {
      stop()
      showToast(t('toast.jammed'), 3000)
    }
  }

  function advance(t: number): void {
    if (!sim) return
    const r = stepsDue(acc, lastT === undefined ? 0 : t - lastT)
    acc = r.acc
    for (let i = 0; i < r.steps; i++) {
      sim.step()
      listen(sim)
      if (sim.goalsMet && !won) onGoalsMet()
      if (!won) showRetry(stall(travelling(sim), sim.stepIndex))
    }
  }

  function frame(t: number): void {
    raf = requestAnimationFrame(frame)
    guarded(() => advance(t), (err) => jammed(err, false))
    lastT = t
    // Idle frames are skipped, except while targets pulse or a hover label is still drawing in.
    const now = performance.now()
    const one = single()?.id
    const nudging = !!one && !sim && (nudgeFor !== one || now - selectedSince < NUDGE_MS)
    const animating = !!tool || nudging || !!hoverEnd || !!grip?.moved || !!spin?.moved || (hover !== undefined && !labelDone(now - hover.since))
    if (!sim && !dirty && !animating) return
    dirty = false
    guarded(draw, (err) => jammed(err, true))
    placeZoneTag()
  }

  /** On the top edge of the selected zone, or just inside it when the zone touches the top of the board. */
  function placeZoneTag(): void {
    const g = author && !sim && !trace ? author.goals()[zoneIndex()] : undefined
    zoneTag.hidden = g?.type !== 'inZone'
    if (g?.type !== 'inZone') return
    const p = sol.placements.find((q) => q.id === g.part)
    zoneTagText.textContent = p ? partLabel(p.kind) : g.part
    const stageRect = stage.getBoundingClientRect()
    const at = unitsToClient({ x: g.zone.x, y: g.zone.y }, canvas.getBoundingClientRect())
    const top = at.y - stageRect.top
    zoneTag.style.left = `${at.x - stageRect.left}px`
    zoneTag.style.top = `${top >= zoneTag.offsetHeight ? top - zoneTag.offsetHeight : top}px`
  }

  function draw(): void {
    const g = group?.started ? group : undefined
    const sg = spin?.moved ? spin : undefined
    const hidden = new Set(g ? g.ids : sg ? sg.ids : drag?.started && drag.moving ? [drag.moving.id] : [])
    const viewSol = hidden.size ? { ...sol, placements: sol.placements.filter((p) => !hidden.has(p.id)) } : sol
    const ghost: PartDrawState | undefined = drag?.started && drag.ghost ? { placement: drag.ghost, ghost: drag.ok ? 'ok' : 'bad' } : undefined
    const moved = g ? movedParts(g) : sg?.turned
    const fits = g ? !!g.next : !!sg?.next
    const ghosts: PartDrawState[] | undefined = moved?.map((placement) => ({ placement, ghost: fits ? 'ok' : 'bad' }))
    const boxed = moved ?? (drag?.started ? [] : sol.placements.filter((p) => selection.includes(p.id)))
    let view = level
    if (author) {
      const zone = trace && rectFromDrag(trace.a, trace.b)
      const traced: Goal[] = zone ? [{ type: 'inZone', part: '', zone }] : []
      view = { ...level, goals: [...author.goals(), ...traced] }
    }
    const now = performance.now()
    const one = single()?.id
    if (one !== nudgeFor) {
      nudgeFor = one
      selectedSince = now
    }
    const lone = single()
    const sp = !sim && !tool && !drag?.started && !g && lone && !isLocked(lone.id) ? lone : undefined
    const gh = !drag?.started && !g && !marquee ? groupHandle() : undefined
    const from = first && anchorAt(level, sol, first)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    render(ctx, {
      level: view, sol: viewSol, sim, ghost, ghosts, won, zoom: fit.zoom,
      selected: sim ? undefined : selection,
      selectedZone: sim || zoneIndex() < 0 ? undefined : zoneIndex(),
      locked: sim ? undefined : author?.locked(),
      selectionBox: !sim && boxed.length ? groupBox(boxed) : undefined,
      selectionBad: !!sg && !sg.next,
      blocked: sg?.blockers,
      marquee: marquee && rectBetween(marquee.a, marquee.b),
      guides: g?.guides,
      pendingAnchor: first, selectedLink: sim ? undefined : selectedLink,
      targets: targets(), pulse: (now % PULSE_MS) / PULSE_MS,
      pendingLine: from && pointer ? { from, to: pointer } : undefined,
      hover: hover && !drag?.started ? { id: hover.id, t: now - hover.since } : undefined,
      meshMarks: drag?.started ? drag.meshMarks : undefined,
      handles: sp ? { at: handlesOf(sp), t: now - selectedSince, hover: hoverEnd && { end: hoverEnd.end, t: now - hoverEnd.since } } : gh ? { at: { rot: gh }, t: now - selectedSince } : undefined,
      dial: sp && grip?.kind === 'rot' && grip.moved ? dialFor(sp, grip.free ?? angleOf(sp)) : spin?.moved ? spinDial(spin) : undefined,
    })
  }

  /** Notch dial around a part being rotated: one tick per rotation step, needle on the free pointer angle. */
  function dialFor(p: Placement, needle: number): NonNullable<RenderView['dial']> {
    const at = handlesOf(p).rot ?? { x: p.x, y: p.y - 40 }
    const dx = at.x - p.x
    const dy = at.y - p.y
    return { center: { x: p.x, y: p.y }, radius: Math.max(40, Math.sqrt(dx * dx + dy * dy)), step: (partDef(p.kind).rotStep * Math.PI) / 12, current: angleOf(p), needle, offset: rotHandleOffset(p) }
  }

  /** Notch dial around the pivot of a turning group: ticks from straight up at the press, needle on the pointer. */
  function spinDial(g: NonNullable<typeof spin>): NonNullable<RenderView['dial']> {
    return { center: g.pivot, radius: g.radius, step: g.step * ROT_ANGLE, current: g.notches * ROT_ANGLE, needle: g.free ?? 0, offset: -Math.PI / 2, bad: !g.next }
  }

  window.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerleave', onPointerLeave)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  for (const type of DIRTY_EVENTS) window.addEventListener(type, markDirty, true)
  void document.fonts?.ready.then(markDirty)
  resize()
  refreshUi()
  author?.link({
    selectGoal: (g) => {
      if (sim) return
      selectedGoal = g?.type === 'inZone' ? g : undefined
      if (selectedGoal) {
        selection = []
        selectedLink = undefined
      }
      // the editor asked for it: no need to tell it back
      notifiedGoal = selectedGoal
      refreshUi()
    },
  })
  raf = requestAnimationFrame(frame)

  return () => {
    // leaving the screen (back, next level, language switch) must silence the running machine
    sound.stopLoops()
    cancelAnimationFrame(raf)
    window.clearTimeout(toastTimer)
    closeMenu?.()
    ro.disconnect()
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('keyup', onKeyUp)
    for (const type of DIRTY_EVENTS) window.removeEventListener(type, markDirty, true)
    root.replaceChildren()
  }
}
