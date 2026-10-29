import { lang, partLabel, t } from '../i18n'
import type { Goal, SimEventName } from '../level/types'
import { STEP_MS } from '../ui/loop'
import { el } from '../ui/dom'
import type { EditorModel } from './model'

const EVENTS: SimEventName[] = ['rope-cut', 'cheese-eaten', 'trap-snapped', 'balloon-ceiling', 'bowl-broken', 'mouse-caught']

export const eventLabel = (e: SimEventName): string => t(`event.${e}`)

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
  return p ? `${partLabel(p.kind)} (${id})` : id
}

export function describeGoal(model: EditorModel, g: Goal): string {
  if (g.type === 'event') return `${eventLabel(g.event)}${g.part ? ` · ${partName(model, g.part)}` : ''}`
  const hold = g.hold ?? 30
  const time = (hold * STEP_MS / 1000).toFixed(2).replace(/\.?0+$/, '')
  return t('goals.inZone', { part: partName(model, g.part), time: lang() === 'fr' ? time.replace('.', ',') : time })
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
  for (const h of HOLDS) zoneHold.append(new Option(t('goals.hold', { time: h.label }), String(h.steps)))
  const traceBtn = el('button', 'btn small', t('goals.trace'))
  const traceHint = el('p', 'hint', t('goals.traceHint'))
  traceBtn.addEventListener('click', () => {
    if (opts.tracing()) opts.trace(undefined)
    else if (zonePart.value) opts.trace({ part: zonePart.value, hold: Number(zoneHold.value) })
  })

  const eventName = el('select')
  for (const e of EVENTS) eventName.append(new Option(eventLabel(e), e))
  const eventPart = el('select')
  const addEvent = el('button', 'btn small', t('goals.add'))
  addEvent.addEventListener('click', () => {
    const g: Goal = { type: 'event', event: eventName.value as SimEventName }
    if (eventPart.value) g.part = eventPart.value
    if (model.addGoal(g)) opts.changed()
  })

  const zoneForm = el('div', 'goal-form')
  zoneForm.append(el('h3', '', t('goals.zoneForm')), zonePart, zoneHold, traceBtn, traceHint)
  const eventForm = el('div', 'goal-form')
  eventForm.append(el('h3', '', t('goals.eventForm')), eventName, eventPart, addEvent)
  root.append(el('h2', '', t('goals.title')), list, zoneForm, eventForm)

  function refresh(): void {
    list.replaceChildren()
    model.level.goals.forEach((g, i) => {
      const li = el('li')
      const del = el('button', 'btn small danger', '×')
      del.title = t('goals.remove')
      del.addEventListener('click', () => {
        model.removeGoal(i)
        opts.changed()
      })
      li.append(el('span', '', describeGoal(model, g)), del)
      list.append(li)
    })
    if (model.level.goals.length === 0) list.append(el('li', 'note', t('goals.none')))
    fillParts(zonePart, model)
    fillParts(eventPart, model, t('goals.anyPart'))
    const tracing = opts.tracing()
    traceBtn.textContent = tracing ? t('goals.cancel') : t('goals.trace')
    traceBtn.disabled = !tracing && model.level.fixed.length === 0
    traceHint.hidden = !tracing
    zonePart.disabled = zoneHold.disabled = tracing
  }

  refresh()
  return { el: root, refresh }
}
