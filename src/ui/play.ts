import { Simulation } from '../game/simulation'
import type { Vec } from '../engine/vec'
import { levelGoal, levelTitle, partLabel, settingLabel, t } from '../i18n'
import { footprint, gearMagnet } from '../level/placement'
import type { Anchor, Goal, Level, PartKind, Placement, Solution } from '../level/types'
import { angleOf, setting } from '../parts/common'
import { gearRadius, gearsMesh } from '../parts/mech/gear'
import { partDef } from '../parts/registry'
import { Pen, type PartDrawState } from '../render/pen'
import { NUDGE_MS, labelDone, PULSE_MS, render, type RenderView } from '../render/renderer'
import { loadProgress, markSolved, saveDraft } from '../storage'
import { addLink, addPart, anchorAt, draftPlacement, drawerDefaults, flipped, freeAngle, grow, handlesOf, hitAnyPart, hitHandle, hitLink, hitPart, linkTargets, nextId, pickAnchor, remaining, removeLink, removePart, resizeToward, rotateToward, rotated, rotHandleOffset, sanitizeDraft, updatePart, withSetting, type HandleKind, type LinkTool } from './edit'
import { clientToUnits, fitCanvas, insideField, panelPosition, rectFromDrag, unitsToClient } from './geometry'
import { guarded, stepsDue } from './loop'
import { el } from './dom'
import { langSwitch } from './langSwitch'
import { sound } from './sound'
import { createImpactTracker } from './soundLogic'

export interface PlayOpts {
  onWin(): void
  onBack(): void
  /** Called once when the goals are met, with the winning solution. */
  onSolved?(sol: Solution): void
  backLabel?: string
  nextLabel?: string
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
  let selected: string | undefined
  /** Selected player link (rope or belt), exclusive with `selected`. */
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
  /** Handle of the selected part being pressed: a click steps it, a drag sets it from the pointer. */
  let grip: { kind: HandleKind; start: { x: number; y: number }; moved: boolean; free?: number } | undefined
  /** Part whose chevrons last nudged, and since when (they nudge again each time a part is selected). */
  let nudgeFor: string | undefined
  let selectedSince = 0
  /** Length handle under the pointer, and since when (its chevron beats while hovered). */
  let hoverEnd: { end: 'start' | 'end'; since: number } | undefined
  let drag: Drag | undefined
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
  const impacts = createImpactTracker()
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
  const toast = el('div', 'toast')
  stage.append(canvas, selPanel, toast)
  const ctx = canvas.getContext('2d')!

  const drawer = el('aside', 'drawer')
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
      selected = undefined
      selectedLink = undefined
      refreshUi()
      b.blur()
    })
    tools.append(b)
    toolButtons.set(lt, b)
  }
  drawer.append(tools, el('h2', '', t('play.parts')))
  const list = el('ul', 'inventory')
  drawer.append(list)

  const launch = el('button', 'launch', t('play.run'))
  launch.title = t('play.runTitle')

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
  } else screen.append(toolbar, stage, drawer, launch, winPanel)
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
      selected = undefined
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
  const selectedPart = (): Placement | undefined => sol.placements.find((p) => p.id === selected)

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

  /** Builds the panel's buttons once per selection; they read the part at click time. */
  function buildSelPanel(p: Placement): void {
    const def = partDef(p.kind)
    panelValues.clear()
    selPanel.replaceChildren(el('div', 'title', partLabel(p.kind)))
    // rotation and length live on the part's own handles
    for (const s of def.settings.filter((d) => d.key !== 'length')) {
      const by = (d: number) => () => edit((q) => withSetting(q, s.key, setting(q, s) + d * s.step))
      selPanel.append(stepper(s.key, settingLabel(s), by(-1), by(1)))
    }
    const actions = el('div', 'row')
    if (def.flippable) {
      const flip = el('button', 'btn small', t('panel.flip'))
      flip.addEventListener('click', () => edit(flipped))
      actions.append(flip)
    }
    const del = el('button', 'btn small danger', t('panel.remove'))
    del.addEventListener('click', removeSelected)
    actions.append(del)
    selPanel.append(actions)
  }

  function updateSelValues(p: Placement): void {
    panelValues.get('rot')?.replaceChildren(`${p.rot * 15}°`)
    for (const s of partDef(p.kind).settings) panelValues.get(s.key)?.replaceChildren(String(setting(p, s)))
  }

  const selectedLinkObj = () => sol.links.find((l) => l.id === selectedLink)

  function buildLinkPanel(kind: 'rope' | 'belt'): void {
    panelValues.clear()
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
    const p = selectedPart()
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

  /** Every edit goes through here: the draft is saved each time. */
  function commit(next: Solution): void {
    sol = next
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
    const p = selectedPart()
    if (!p || sim) return
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
    if (!selected) return
    const id = selected
    selected = undefined
    commit(removePart(sol, id))
  }

  function refreshUi(): void {
    dirty = true
    refreshDrawer()
    refreshSelPanel()
    canvas.classList.toggle('dragging', !!drag?.started)
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
    const sp = selectedPart()
    const handle = sp && hitHandle(sp, pt)
    if (handle) {
      e.preventDefault()
      grip = { kind: handle, start: { x: e.clientX, y: e.clientY }, moved: false }
      refreshUi()
      return
    }
    const hit = hitPart(sol, pt)
    selected = hit?.id
    selectedLink = !hit ? hitLink(level, sol, pt) : undefined
    if (hit) {
      e.preventDefault()
      drag = { kind: hit.kind, moving: hit, id: hit.id, offset: { x: hit.x - pt.x, y: hit.y - pt.y }, start: { x: e.clientX, y: e.clientY }, started: false, ok: false }
    }
    refreshUi()
  })

  function onPointerMove(e: PointerEvent): void {
    if (trace) {
      trace.b = unitsAt(e)
      return
    }
    if (e.target === canvas) pointer = unitsAt(e)
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
      const sp = !tool ? selectedPart() : undefined
      const handle = sp && hitHandle(sp, pt)
      const end = handle === 'start' || handle === 'end' ? handle : undefined
      if (end !== hoverEnd?.end) hoverEnd = end ? { end, since: performance.now() } : undefined
      canvas.classList.toggle('over-rot', handle === 'rot')
      canvas.classList.toggle('over-end', !!end)
      const clickable = tool ? !!over : !!(handle || hitPart(sol, pt) || hitLink(level, sol, pt))
      canvas.classList.toggle('over-part', !author?.tracing() && clickable)
    }
  }

  /** Rotates or resizes the selected part from a handle drag, once past the drag threshold. */
  function moveGrip(g: NonNullable<typeof grip>, e: PointerEvent): void {
    const p = selectedPart()
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
      commit(r)
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
    if (grip) {
      const g = grip
      grip = undefined
      // a click steps once: one notch clockwise, or one cell longer on that end
      if (!g.moved) edit((q) => (g.kind === 'rot' ? rotated(q, 1) : grow(q, g.kind, 1)))
      refreshUi()
      const sp = selectedPart()
      if (sp && !selPanel.hidden) positionSelPanel(sp)
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
        selected = d.id
      } else if (d.moving && drawer.contains(e.target as Node)) {
        selected = undefined
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
    drag = undefined
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
    sim = undefined
    won = false
    winPanel.hidden = true
    screen.classList.remove('running')
    launch.textContent = t('play.run')
    refreshUi()
  }

  const toggle = (): void => (sim ? stop() : start())

  function onGoalsMet(): void {
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
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
    if (e.code === 'Space') {
      e.preventDefault()
      if (!e.repeat) toggle()
      return
    }
    if (sim) return
    // Leave browser and system shortcuts (Ctrl+R, Cmd+F, Alt+Backspace…) alone.
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'r' || e.key === 'R') edit((p) => rotated(p, e.shiftKey ? -1 : 1))
    else if (e.key === 'f' || e.key === 'F') edit(flipped)
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      removeSelected()
    } else if (e.key === 'Escape') {
      trace = undefined
      selected = undefined
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
    fit = fitCanvas(stage.clientWidth - 16, stage.clientHeight - 16, window.devicePixelRatio || 1)
    canvas.style.width = `${fit.cssW}px`
    canvas.style.height = `${fit.cssH}px`
    canvas.width = fit.pxW
    canvas.height = fit.pxH
    dirty = true
    const p = selectedPart()
    if (p && !selPanel.hidden) positionSelPanel(p)
  }
  const ro = new ResizeObserver(resize)
  ro.observe(stage)

  /** Sound only reads the sim after a step: new impacts and parts whose glow just jumped. */
  function listen(s: Simulation): void {
    const hit = impacts(s.lastContacts.filter((c) => !c.began).map((c) => {
      const a = bodyId(c.a)
      const b = bodyId(c.b)
      return { key: a < b ? `${a}:${b}` : `${b}:${a}`, impulse: c.impulse }
    }))
    if (hit > 0) sound.tick(hit)
    const next = new Map<string, number>()
    for (const p of s.parts) {
      next.set(p.id, p.glow)
      if (p.glow > (prevGlow.get(p.id) ?? 0)) sound.activate(p.kind)
    }
    prevGlow = next
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
    }
  }

  function frame(t: number): void {
    raf = requestAnimationFrame(frame)
    guarded(() => advance(t), (err) => jammed(err, false))
    lastT = t
    // Idle frames are skipped, except while targets pulse or a hover label is still drawing in.
    const now = performance.now()
    const nudging = !!selected && !sim && (nudgeFor !== selected || now - selectedSince < NUDGE_MS)
    const animating = !!tool || nudging || !!hoverEnd || !!grip?.moved || (hover !== undefined && !labelDone(now - hover.since))
    if (!sim && !dirty && !animating) return
    dirty = false
    guarded(draw, (err) => jammed(err, true))
  }

  function draw(): void {
    const moving = drag?.started ? drag.moving?.id : undefined
    const viewSol = moving ? { ...sol, placements: sol.placements.filter((p) => p.id !== moving) } : sol
    const ghost: PartDrawState | undefined = drag?.started && drag.ghost ? { placement: drag.ghost, ghost: drag.ok ? 'ok' : 'bad' } : undefined
    let view = level
    if (author) {
      const zone = trace && rectFromDrag(trace.a, trace.b)
      const traced: Goal[] = zone ? [{ type: 'inZone', part: '', zone }] : []
      view = { ...level, goals: [...author.goals(), ...traced] }
    }
    const now = performance.now()
    if (selected !== nudgeFor) {
      nudgeFor = selected
      selectedSince = now
    }
    const sp = !sim && !tool && !drag?.started ? selectedPart() : undefined
    const from = first && anchorAt(level, sol, first)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    render(ctx, {
      level: view, sol: viewSol, sim, ghost, selected: sim ? undefined : selected, won, zoom: fit.zoom,
      pendingAnchor: first, selectedLink: sim ? undefined : selectedLink,
      targets: targets(), pulse: (now % PULSE_MS) / PULSE_MS,
      pendingLine: from && pointer ? { from, to: pointer } : undefined,
      hover: hover && !drag?.started ? { id: hover.id, t: now - hover.since } : undefined,
      meshMarks: drag?.started ? drag.meshMarks : undefined,
      handles: sp ? { at: handlesOf(sp), t: now - selectedSince, hover: hoverEnd && { end: hoverEnd.end, t: now - hoverEnd.since } } : undefined,
      dial: sp && grip?.kind === 'rot' && grip.moved ? dialFor(sp, grip.free ?? angleOf(sp)) : undefined,
    })
  }

  /** Notch dial around a part being rotated: one tick per rotation step, needle on the free pointer angle. */
  function dialFor(p: Placement, needle: number): NonNullable<RenderView['dial']> {
    const at = handlesOf(p).rot ?? { x: p.x, y: p.y - 40 }
    const dx = at.x - p.x
    const dy = at.y - p.y
    return { center: { x: p.x, y: p.y }, radius: Math.max(40, Math.sqrt(dx * dx + dy * dy)), step: (partDef(p.kind).rotStep * Math.PI) / 12, current: angleOf(p), needle, offset: rotHandleOffset(p) }
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
  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    window.clearTimeout(toastTimer)
    ro.disconnect()
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('keyup', onKeyUp)
    for (const type of DIRTY_EVENTS) window.removeEventListener(type, markDirty, true)
    root.replaceChildren()
  }
}
