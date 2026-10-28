import { Simulation } from '../game/simulation'
import type { Vec } from '../engine/vec'
import { footprint } from '../level/placement'
import type { Anchor, Goal, Level, PartKind, Placement, Solution } from '../level/types'
import { setting } from '../parts/common'
import { partDef } from '../parts/registry'
import { Pen, type PartDrawState } from '../render/pen'
import { render } from '../render/renderer'
import { loadProgress, markSolved, saveDraft } from '../storage'
import { addLink, addPart, anchorAt, draftPlacement, drawerDefaults, flipped, hitAnchor, hitLink, hitPart, nextId, remaining, removeLink, removePart, rotated, sanitizeDraft, updatePart, withSetting } from './edit'
import { clientToUnits, fitCanvas, insideField, panelPosition, rectFromDrag, unitsToClient } from './geometry'
import { guarded, stepsDue } from './loop'
import { el } from './dom'
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
}

/** Pixels the pointer must travel before a press on a placed part becomes a move (else it's a click). */
const DRAG_THRESHOLD = 4

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
  /** First anchor clicked when making a link. */
  let pendingAnchor: Anchor | undefined
  /** Anchor under the last press, turned into an anchor click on release unless the press became a drag. */
  let pressedAnchor: Anchor | undefined
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
  const back = el('button', 'btn ghost', opts.backLabel ?? '← Niveaux')
  const title = el('h1', '', level.title)
  const goal = el('p', 'goal', level.goalText)
  const mute = el('button', 'btn ghost mute')
  const refreshMute = (): void => {
    const m = sound.isMuted()
    mute.textContent = m ? '🔇' : '🔊'
    mute.title = m ? 'Activer le son' : 'Couper le son'
    mute.setAttribute('aria-label', mute.title)
    mute.setAttribute('aria-pressed', String(m))
  }
  refreshMute()
  mute.addEventListener('click', () => {
    sound.setMuted(!sound.isMuted())
    refreshMute()
    sound.click()
  })
  if (author) toolbar.append(back, ...author.toolbar, mute)
  else toolbar.append(back, title, goal, mute)

  const stage = el('main', 'stage')
  const canvas = el('canvas')
  const selPanel = el('div', 'selpanel')
  const toast = el('div', 'toast')
  stage.append(canvas, selPanel, toast)
  const ctx = canvas.getContext('2d')!

  const drawer = el('aside', 'drawer')
  drawer.append(el('h2', '', 'Pièces'))
  const list = el('ul', 'inventory')
  drawer.append(list)

  const launch = el('button', 'launch', 'Lancer')
  launch.title = 'Lancer / Stop (Espace)'

  const winPanel = el('div', 'win')
  winPanel.hidden = true
  const winBox = el('div', 'win-box')
  const next = el('button', 'btn primary', opts.nextLabel ?? 'Suivant')
  const replay = el('button', 'btn', 'Rejouer')
  winBox.append(el('h2', '', 'Réussi !'), el('p', '', level.goalText), next, replay)
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
    li.append(partIcon(kind), el('span', 'name', partDef(kind).label), count)
    li.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || sim || (remaining(level, sol).get(kind) ?? 0) <= 0) return
      e.preventDefault()
      selected = undefined
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
    selPanel.replaceChildren(el('div', 'title', def.label))
    if (def.rotStep) selPanel.append(stepper('rot', 'Rotation', () => edit((q) => rotated(q, -1)), () => edit((q) => rotated(q, 1))))
    for (const s of def.settings) {
      const by = (d: number) => () => edit((q) => withSetting(q, s.key, setting(q, s) + d * s.step))
      selPanel.append(stepper(s.key, s.label, by(-1), by(1)))
    }
    const actions = el('div', 'row')
    if (def.flippable) {
      const flip = el('button', 'btn small', 'Miroir (F)')
      flip.addEventListener('click', () => edit(flipped))
      actions.append(flip)
    }
    const del = el('button', 'btn small danger', 'Retirer')
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
    const del = el('button', 'btn small danger', 'Retirer')
    del.addEventListener('click', removeSelected)
    const actions = el('div', 'row')
    actions.append(del)
    selPanel.replaceChildren(el('div', 'title', kind === 'rope' ? 'Corde' : 'Courroie'), actions)
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
    const fp = footprint(p)
    const anchor = unitsToClient({ x: Math.max(...fp.map((q) => q.x)), y: Math.min(...fp.map((q) => q.y)) }, canvas.getBoundingClientRect())
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
    if (author) author.onChange(sol)
    else saveDraft(level.id, sol)
    refreshUi()
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
    else showToast('Pas la place ici')
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
    const ghost = { ...draftPlacement(drag.kind, at, drag.id), rot: base.rot, flip: base.flip, settings: base.settings }
    drag.ghost = ghost
    drag.ok = (drag.moving ? updatePart(level, sol, ghost) : addPart(level, sol, ghost)) !== null
  }

  /** Links: click an anchor, then a second one; a rope or a belt is made from their role. */
  function anchorClicked(a: Anchor): void {
    selected = undefined
    selectedLink = undefined
    const first = pendingAnchor
    if (!first || (first.part === a.part && first.anchor === a.anchor)) {
      pendingAnchor = first ? undefined : a
      if (pendingAnchor) showToast("Cliquez un second point d'attache")
      return
    }
    pendingAnchor = undefined
    const next = addLink(level, sol, first, a)
    if (next) commit(next)
    else showToast('Liaison impossible')
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || sim) return
    const pt = unitsAt(e)
    if (author?.tracing()) {
      e.preventDefault()
      trace = { a: pt, b: pt }
      return
    }
    pressedAnchor = hitAnchor(level, sol, pt)
    const hit = hitPart(sol, pt)
    selected = pressedAnchor ? undefined : hit?.id
    selectedLink = !pressedAnchor && !hit ? hitLink(level, sol, pt) : undefined
    if (!pressedAnchor) pendingAnchor = undefined
    if (pressedAnchor) e.preventDefault()
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
    if (drag) {
      updateDrag(e)
      canvas.classList.toggle('dragging', drag.started)
      return
    }
    if (!sim && e.target === canvas) {
      const pt = unitsAt(e)
      canvas.classList.toggle('tracing', !!author?.tracing())
      canvas.classList.toggle('over-part', !author?.tracing() && !!(hitAnchor(level, sol, pt) || hitPart(sol, pt) || hitLink(level, sol, pt)))
    }
  }

  function onPointerUp(e: PointerEvent): void {
    if (trace) {
      const zone = rectFromDrag(trace.a, unitsAt(e))
      trace = undefined
      if (!author?.tracing()) return
      if (zone) author.onTraced(zone)
      else showToast('Zone trop petite')
      return
    }
    const d = drag
    const a = pressedAnchor
    pressedAnchor = undefined
    if (a && !d?.started) {
      drag = undefined
      anchorClicked(a)
      refreshUi()
      return
    }
    if (!d) return
    drag = undefined
    if (d.started) {
      updateDrag(e)
      if (d.ghost && d.ok) {
        sound.click()
        commit((d.moving ? updatePart(level, sol, d.ghost) : addPart(level, sol, d.ghost))!)
        selected = d.id
      } else if (d.moving && drawer.contains(e.target as Node)) {
        selected = undefined
        sound.click()
        commit(removePart(sol, d.id))
      } else if (d.ghost) {
        showToast('Pas la place ici')
      }
    }
    refreshUi()
  }

  // ---- run / stop ----
  function start(): void {
    if (sim || author) return
    drag = undefined
    pendingAnchor = undefined
    pressedAnchor = undefined
    // Always a fresh Simulation from the saved solution: nothing is carried over between runs.
    sim = new Simulation(level, sol)
    prevGlow = new Map()
    sound.click()
    won = false
    acc = 0
    lastT = undefined
    screen.classList.add('running')
    launch.textContent = 'Stop'
    refreshUi()
  }

  function stop(): void {
    sim = undefined
    won = false
    winPanel.hidden = true
    screen.classList.remove('running')
    launch.textContent = 'Lancer'
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
      pendingAnchor = undefined
      refreshUi()
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
      showToast('La machine s’est enrayée… Modifiez-la puis relancez.', 3000)
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
    if (!sim && !dirty) return
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
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    render(ctx, {
      level: view, sol: viewSol, sim, ghost, selected: sim ? undefined : selected, won, zoom: fit.zoom,
      showAnchors: !sim, pendingAnchor, selectedLink: sim ? undefined : selectedLink,
    })
  }

  window.addEventListener('pointermove', onPointerMove)
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
