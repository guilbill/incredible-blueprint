import '../ui/style.css'
import './lab.css'
import { COLORS, Pen } from '../render/pen'
import { sound } from '../ui/sound'
import type { LabTopic, Variant } from './lab'

const topics = import.meta.glob<LabTopic>('./topics/*.ts', { eager: true, import: 'default' })
const nameOf = (path: string): string => path.replace(/^.*\/(.+)\.ts$/, '$1')
const CHOICE_KEY = 'lab.choice.'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

function readChoice(topic: string): string | null {
  try {
    return localStorage.getItem(CHOICE_KEY + topic)
  } catch {
    return null
  }
}

function saveChoice(topic: string, name: string): void {
  try {
    localStorage.setItem(CHOICE_KEY + topic, name)
  } catch {
    // the choice still shows on the page
  }
}

function board(v: Variant, size: { w: number; h: number }): HTMLCanvasElement {
  const css = 320
  const scale = css / size.w
  const dpr = window.devicePixelRatio || 1
  const c = el('canvas', 'board')
  c.width = css * dpr
  c.height = size.h * scale * dpr
  c.style.width = `${css}px`
  c.style.height = `${size.h * scale}px`
  const ctx = c.getContext('2d')!
  ctx.scale(dpr * scale, dpr * scale)
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, size.w, size.h)
  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth = 0.5
  for (let x = 0; x <= size.w; x += 20) ctx.strokeRect(x, 0, 0, size.h)
  for (let y = 0; y <= size.h; y += 20) ctx.strokeRect(0, y, size.w, 0)
  v.draw!(new Pen(ctx), size)
  return c
}

function showTopic(name: string, topic: LabTopic): void {
  document.title = `Lab · ${topic.title}`
  const root = el('main', 'lab')
  const back = el('a', 'back', '← sujets')
  back.href = '?'
  const chosen = el('p', 'chosen')
  const refreshChosen = (): void => {
    const c = readChoice(name)
    chosen.textContent = c ? `Choix : ${c}` : 'Pas encore de choix'
  }
  root.append(back, el('h1', '', topic.title), el('p', 'question', topic.question), chosen)
  const grid = el('div', 'variants')
  const cleanups: (() => void)[] = []
  topic.variants.forEach((v, i) => {
    const card = el('section', 'variant')
    card.dataset.variant = v.name
    card.append(el('h2', '', `${i < 26 ? String.fromCharCode(65 + i) : i + 1} · ${v.name}`))
    if (v.note) card.append(el('p', 'note', v.note))
    if (v.draw) card.append(board(v, topic.board ?? { w: 320, h: 200 }))
    if (v.mount) {
      const live = el('div', 'live')
      card.append(live)
      const off = v.mount(live)
      if (off) cleanups.push(off)
    }
    const actions = el('div', 'actions')
    if (v.play) {
      const play = el('button', 'btn small', '▶ écouter')
      play.addEventListener('click', () => v.play!())
      actions.append(play)
    }
    const pick = el('button', 'btn small primary', 'choisir')
    pick.addEventListener('click', () => {
      saveChoice(name, v.name)
      for (const c of grid.children) c.classList.toggle('picked', c === card)
      refreshChosen()
    })
    actions.append(pick)
    card.append(actions)
    card.classList.toggle('picked', readChoice(name) === v.name)
    grid.append(card)
  })
  root.append(grid)
  refreshChosen()
  document.body.replaceChildren(root)
  window.addEventListener('pagehide', () => cleanups.forEach((f) => f()), { once: true })
}

function showIndex(): void {
  const root = el('main', 'lab')
  root.append(el('h1', '', 'Lab'), el('p', 'question', 'Sujets en cours de choix. Ajoute un fichier dans src/lab/topics/.'))
  const list = el('ul', 'topics')
  for (const path of Object.keys(topics).sort()) {
    const name = nameOf(path)
    const li = el('li')
    const a = el('a', '', topics[path].title)
    a.href = `?topic=${encodeURIComponent(name)}`
    const c = readChoice(name)
    li.append(a, el('span', 'note', c ? ` → ${c}` : ''))
    list.append(li)
  }
  root.append(list)
  document.body.replaceChildren(root)
}

sound.arm()
const wanted = new URLSearchParams(location.search).get('topic')
const path = wanted && Object.keys(topics).find((p) => nameOf(p) === wanted)
if (path) showTopic(wanted!, topics[path])
else showIndex()
