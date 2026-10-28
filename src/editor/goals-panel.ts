import type { Goal, SimEventName } from '../level/types'
import { partDef } from '../parts/registry'
import { STEP_MS } from '../ui/loop'
import { el } from '../ui/dom'
import type { EditorModel } from './model'

export const EVENT_LABELS: Record<SimEventName, string> = {
  'rope-cut': 'Corde coupée',
  'cheese-eaten': 'Fromage mangé',
  'trap-snapped': 'Tapette déclenchée',
  'balloon-ceiling': 'Ballon au plafond',
  'bowl-broken': 'Bocal cassé',
  'mouse-caught': 'Souris attrapée',
}

/** How long the part must stay in its zone, in simulation steps (120 per second). */
const HOLDS: { steps: number; label: string }[] = [
  { steps: 30, label: '¼ s' },
  { steps: 120, label: '1 s' },
  { steps: 360, label: '3 s' },
]

export interface GoalsPanelOpts {
  /** The model changed: save and redraw. */
  changed(): void
  /** Start (or, with undefined, cancel) tracing a zone for `part` on the field. */
  trace(target: { part: string; hold: number } | undefined): void
  tracing(): boolean
}

export interface GoalsPanel { el: HTMLElement; refresh(): void }

function partName(model: EditorModel, id: string): string {
  const p = model.level.fixed.find((q) => q.id === id)
  return p ? `${partDef(p.kind).label} (${id})` : id
}

export function describeGoal(model: EditorModel, g: Goal): string {
  if (g.type === 'event') return `${EVENT_LABELS[g.event]}${g.part ? ` · ${partName(model, g.part)}` : ''}`
  const hold = g.hold ?? 30
  return `${partName(model, g.part)} dans la zone · ${(hold * STEP_MS / 1000).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')} s`
}

function fillParts(select: HTMLSelectElement, model: EditorModel, any?: string): void {
  const keep = select.value
  select.replaceChildren()
  if (any !== undefined) select.append(new Option(any, ''))
  for (const p of model.level.fixed) select.append(new Option(partName(model, p.id), p.id))
  if ([...select.options].some((o) => o.value === keep)) select.value = keep
}

/** Goal list plus the two ways to add one: a part in a traced zone, or an event. */
export function goalsPanel(model: EditorModel, opts: GoalsPanelOpts): GoalsPanel {
  const root = el('section', 'goals')
  const list = el('ul', 'goal-list')

  const zonePart = el('select')
  const zoneHold = el('select')
  for (const h of HOLDS) zoneHold.append(new Option(`tenir ${h.label}`, String(h.steps)))
  const traceBtn = el('button', 'btn small', 'Tracer la zone')
  const traceHint = el('p', 'hint', 'Glissez sur le plan pour tracer la zone. Échap pour annuler.')
  traceBtn.addEventListener('click', () => {
    if (opts.tracing()) opts.trace(undefined)
    else if (zonePart.value) opts.trace({ part: zonePart.value, hold: Number(zoneHold.value) })
  })

  const eventName = el('select')
  for (const [k, label] of Object.entries(EVENT_LABELS)) eventName.append(new Option(label, k))
  const eventPart = el('select')
  const addEvent = el('button', 'btn small', 'Ajouter')
  addEvent.addEventListener('click', () => {
    const g: Goal = { type: 'event', event: eventName.value as SimEventName }
    if (eventPart.value) g.part = eventPart.value
    if (model.addGoal(g)) opts.changed()
  })

  const zoneForm = el('div', 'goal-form')
  zoneForm.append(el('h3', '', 'Objet dans une zone'), zonePart, zoneHold, traceBtn, traceHint)
  const eventForm = el('div', 'goal-form')
  eventForm.append(el('h3', '', 'Événement'), eventName, eventPart, addEvent)
  root.append(el('h2', '', 'Objectifs'), list, zoneForm, eventForm)

  function refresh(): void {
    list.replaceChildren()
    model.level.goals.forEach((g, i) => {
      const li = el('li')
      const del = el('button', 'btn small danger', '×')
      del.title = 'Retirer cet objectif'
      del.addEventListener('click', () => {
        model.removeGoal(i)
        opts.changed()
      })
      li.append(el('span', '', describeGoal(model, g)), del)
      list.append(li)
    })
    if (model.level.goals.length === 0) list.append(el('li', 'note', 'Aucun objectif : ajoutez-en au moins un.'))
    fillParts(zonePart, model)
    fillParts(eventPart, model, 'n’importe quelle pièce')
    const tracing = opts.tracing()
    traceBtn.textContent = tracing ? 'Annuler' : 'Tracer la zone'
    traceBtn.disabled = !tracing && model.level.fixed.length === 0
    traceHint.hidden = !tracing
    zonePart.disabled = zoneHold.disabled = tracing
  }

  refresh()
  return { el: root, refresh }
}
