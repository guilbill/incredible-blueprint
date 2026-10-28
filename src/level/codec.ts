import { PART_DEFS } from '../parts/registry'
import { rotAllowed, FIELD } from './placement'
import type { Level, PartKind, Placement } from './types'

export type DecodeResult = { ok: true; level: Level } | { ok: false; error: string }

const EVENTS = ['rope-cut', 'cheese-eaten', 'trap-snapped', 'balloon-ceiling', 'bowl-broken', 'mouse-caught']
/** Decompressed payloads above this are refused (a tiny link must not inflate into gigabytes). */
const MAX_BYTES = 1_000_000

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isKind = (x: unknown): x is PartKind => typeof x === 'string' && Object.prototype.hasOwnProperty.call(PART_DEFS, x)

function validatePlacement(p: unknown, where: string): string | null {
  if (!isObj(p)) return `${where} : pièce invalide.`
  if (typeof p.id !== 'string' || p.id === '') return `${where} : identifiant manquant.`
  if (!isKind(p.kind)) return `Pièce inconnue : « ${String(p.kind)} ».`
  if (!isNum(p.x) || !isNum(p.y) || p.x < 0 || p.y < 0 || p.x > FIELD.w || p.y > FIELD.h) return `La pièce « ${p.id} » sort du terrain.`
  if (!isNum(p.rot) || !isObj(p.settings) || typeof p.flip !== 'boolean') return `La pièce « ${p.id} » est mal formée.`
  const pl = p as unknown as Placement
  if (!rotAllowed(pl)) return `La pièce « ${p.id} » a une rotation interdite.`
  const def = PART_DEFS[pl.kind]!
  for (const [key, val] of Object.entries(pl.settings)) {
    const s = def.settings.find((d) => d.key === key)
    if (!s) return `La pièce « ${p.id} » a un réglage inconnu : « ${key} ».`
    if (!Number.isInteger(val) || val < s.min || val > s.max) return `Le réglage « ${key} » de « ${p.id} » est hors limites.`
  }
  return null
}

/** Returns a French error message, or null when the level is playable. Never throws. */
export function validateLevel(x: unknown): string | null {
  try {
    if (!isObj(x)) return 'Ce niveau est illisible.'
    if (x.v !== 1) return 'Ce niveau vient d’une autre version du jeu.'
    if (typeof x.id !== 'string' || typeof x.title !== 'string' || typeof x.goalText !== 'string') return 'Il manque le titre ou l’objectif du niveau.'
    if (!Array.isArray(x.fixed) || !Array.isArray(x.fixedLinks) || !Array.isArray(x.inventory) || !Array.isArray(x.goals)) return 'Le niveau est incomplet.'
    const ids = new Set<string>()
    for (const p of x.fixed) {
      const err = validatePlacement(p, 'Pièce fixe')
      if (err) return err
      const id = (p as Placement).id
      if (ids.has(id)) return `Identifiant en double : « ${id} ».`
      ids.add(id)
    }
    const parts = x.fixed as Placement[]
    for (const l of x.fixedLinks) {
      if (!isObj(l) || typeof l.id !== 'string' || (l.kind !== 'rope' && l.kind !== 'belt') || !isObj(l.a) || !isObj(l.b)) return 'Un lien est mal formé.'
      if (ids.has(l.id)) return `Identifiant en double : « ${l.id} ».`
      ids.add(l.id)
      for (const end of [l.a, l.b]) {
        const part = parts.find((q) => q.id === end.part)
        if (!part) return `Le lien « ${l.id} » vise une pièce absente.`
        const anchor = PART_DEFS[part.kind]!.anchors.find((d) => d.key === end.anchor)
        if (!anchor) return `Le lien « ${l.id} » vise un point d’attache inconnu.`
        if (anchor.role !== l.kind) return `Le lien « ${l.id} » ne peut pas s’attacher là.`
      }
      if ((l.a as { part: unknown }).part === (l.b as { part: unknown }).part) return `Le lien « ${l.id} » relie une pièce à elle-même.`
    }
    for (const g of x.goals) {
      if (!isObj(g)) return 'Un objectif est mal formé.'
      if (g.type === 'inZone') {
        const z = g.zone
        if (!isObj(z) || !isNum(z.x) || !isNum(z.y) || !isNum(z.w) || !isNum(z.h)) return 'Une zone d’objectif est mal formée.'
        if (g.hold !== undefined && !isNum(g.hold)) return 'Un objectif a une durée invalide.'
        if (!ids.has(g.part as string)) return 'Un objectif vise une pièce absente.'
      } else if (g.type === 'event') {
        if (typeof g.event !== 'string' || !EVENTS.includes(g.event)) return 'Un objectif a un événement inconnu.'
        if (g.part !== undefined && !ids.has(g.part as string)) return 'Un objectif vise une pièce absente.'
      } else return 'Un objectif est de type inconnu.'
    }
    for (const it of x.inventory) {
      if (!isObj(it) || !isKind(it.kind)) return `Pièce d’inventaire inconnue : « ${isObj(it) ? String(it.kind) : '?'} ».`
      if (!Number.isInteger(it.count) || (it.count as number) < 0) return 'Une quantité d’inventaire est invalide.'
    }
    return null
  } catch {
    return 'Ce niveau est illisible.'
  }
}

const toB64Url = (b: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromB64Url = (s: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('alphabet')
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function pump(stream: { writable: WritableStream; readable: ReadableStream<Uint8Array> }, input: Uint8Array): Promise<Uint8Array> {
  const w = stream.writable.getWriter()
  w.write(input as BufferSource).catch(() => {})
  w.close().catch(() => {})
  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {})
      throw new Error('too big')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

export async function encodeLevel(l: Level): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(l))
  return toB64Url(await pump(new CompressionStream('deflate-raw'), raw))
}

export function parseLevel(text: string): DecodeResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Ce niveau est illisible : le contenu est corrompu.' }
  }
  const error = validateLevel(data)
  return error ? { ok: false, error } : { ok: true, level: data as Level }
}

/** Never throws: any failure becomes `{ ok: false, error }` with a French message. */
export async function decodeLevel(s: string): Promise<DecodeResult> {
  try {
    const bytes = await pump(new DecompressionStream('deflate-raw'), fromB64Url(s.trim()))
    return parseLevel(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return { ok: false, error: 'Ce lien est cassé ou incomplet : impossible de lire le niveau.' }
  }
}

export const shareUrl = (encoded: string, loc: { origin: string; pathname: string } = location): string => `${loc.origin}${loc.pathname}#l=${encoded}`

export function levelToFile(l: Level): Blob {
  return new Blob([JSON.stringify(l, null, 2)], { type: 'application/json' })
}

export async function levelFromFile(f: File): Promise<DecodeResult> {
  try {
    return parseLevel(await f.text())
  } catch {
    return { ok: false, error: 'Impossible de lire ce fichier.' }
  }
}
