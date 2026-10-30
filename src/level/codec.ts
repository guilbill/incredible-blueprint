import { t } from '../i18n'
import { canLink } from '../parts/mech/links'
import { PART_DEFS } from '../parts/registry'
import { canPlace, rotAllowed, FIELD } from './placement'
import type { Level, PartKind, Placement } from './types'

export type DecodeResult = { ok: true; level: Level } | { ok: false; error: string }

const EVENTS = ['rope-cut', 'cheese-eaten', 'trap-snapped', 'balloon-ceiling', 'bowl-broken', 'mouse-caught']
/** Decompressed payloads above this are refused (a tiny link must not inflate into gigabytes). */
const MAX_BYTES = 1_000_000
/** Caps on what a level may hold, so a crafted link or file cannot freeze the game. */
export const LIMITS = { fixed: 300, fixedLinks: 100, goals: 20, inventoryCount: 99, title: 60, hold: 3600 }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isKind = (x: unknown): x is PartKind => typeof x === 'string' && Object.prototype.hasOwnProperty.call(PART_DEFS, x)

function validatePlacement(p: unknown, where: string): string | null {
  if (!isObj(p)) return t('codec.badPart', { where })
  if (typeof p.id !== 'string' || p.id === '') return t('codec.noId', { where })
  if (!isKind(p.kind)) return t('codec.unknownPart', { kind: String(p.kind) })
  if (!isNum(p.x) || !isNum(p.y) || p.x < 0 || p.y < 0 || p.x > FIELD.w || p.y > FIELD.h) return t('codec.offField', { id: p.id })
  if (!isNum(p.rot) || !isObj(p.settings) || typeof p.flip !== 'boolean') return t('codec.malformed', { id: p.id })
  const pl = p as unknown as Placement
  if (!rotAllowed(pl)) return t('codec.badRot', { id: p.id })
  const def = PART_DEFS[pl.kind]!
  if (pl.flip && !def.flippable) return t('codec.noFlip', { id: p.id })
  for (const [key, val] of Object.entries(pl.settings)) {
    const s = def.settings.find((d) => d.key === key)
    if (!s) return t('codec.unknownSetting', { id: p.id, key })
    if (!Number.isInteger(val) || val < s.min || val > s.max) return t('codec.settingRange', { id: p.id, key })
  }
  return null
}

/** Returns an error message for the player (current language), or null when the level is playable. Never throws. */
export function validateLevel(x: unknown): string | null {
  try {
    if (!isObj(x)) return t('codec.unreadable')
    if (x.v !== 1) return t('codec.version')
    if (typeof x.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(x.id)) return t('codec.badLevelId')
    if (typeof x.title !== 'string') return t('codec.noText')
    if (x.title.length > LIMITS.title) return t('codec.titleLong', { max: LIMITS.title })
    if (!Array.isArray(x.fixed) || !Array.isArray(x.fixedLinks) || !Array.isArray(x.inventory) || !Array.isArray(x.goals)) return t('codec.incomplete')
    if (x.fixed.length > LIMITS.fixed) return t('codec.tooManyParts', { max: LIMITS.fixed })
    if (x.fixedLinks.length > LIMITS.fixedLinks) return t('codec.tooManyLinks', { max: LIMITS.fixedLinks })
    if (x.goals.length > LIMITS.goals) return t('codec.tooManyGoals', { max: LIMITS.goals })
    const ids = new Set<string>()
    const placed: Placement[] = []
    for (const p of x.fixed) {
      const err = validatePlacement(p, t('codec.fixedPart'))
      if (err) return err
      const pl = p as Placement
      if (ids.has(pl.id)) return t('codec.duplicateId', { id: pl.id })
      if (!canPlace(pl, placed)) return t('codec.overlap', { id: pl.id })
      ids.add(pl.id)
      placed.push(pl)
    }
    const parts = x.fixed as Placement[]
    for (const l of x.fixedLinks) {
      if (!isObj(l) || typeof l.id !== 'string' || (l.kind !== 'rope' && l.kind !== 'belt') || !isObj(l.a) || !isObj(l.b)) return t('codec.badLink')
      if (ids.has(l.id)) return t('codec.duplicateId', { id: l.id })
      ids.add(l.id)
      for (const end of [l.a, l.b]) {
        const part = parts.find((q) => q.id === end.part)
        if (!part) return t('codec.linkMissing', { id: l.id })
        const anchor = PART_DEFS[part.kind]!.anchors.find((d) => d.key === end.anchor)
        if (!anchor) return t('codec.linkAnchor', { id: l.id })
        if (anchor.role !== l.kind) return t('codec.linkRole', { id: l.id })
      }
      if ((l.a as { part: unknown }).part === (l.b as { part: unknown }).part) return t('codec.linkSelf', { id: l.id })
      if (!canLink(l.a as never, l.b as never, parts)) return t('codec.linkGears', { id: l.id })
    }
    for (const g of x.goals) {
      if (!isObj(g)) return t('codec.badGoal')
      if (g.type === 'inZone') {
        const z = g.zone
        if (!isObj(z) || !isNum(z.x) || !isNum(z.y) || !isNum(z.w) || !isNum(z.h)) return t('codec.badZone')
        if (z.w <= 0 || z.h <= 0 || z.x < 0 || z.y < 0 || z.x + z.w > FIELD.w || z.y + z.h > FIELD.h) return t('codec.zoneOff')
        if (g.hold !== undefined && (!Number.isInteger(g.hold) || (g.hold as number) < 1 || (g.hold as number) > LIMITS.hold)) return t('codec.badHold')
        if (!ids.has(g.part as string)) return t('codec.goalMissing')
      } else if (g.type === 'event') {
        if (typeof g.event !== 'string' || !EVENTS.includes(g.event)) return t('codec.badEvent')
        if (g.part !== undefined && !ids.has(g.part as string)) return t('codec.goalMissing')
      } else return t('codec.badGoalType')
    }
    for (const it of x.inventory) {
      if (!isObj(it) || !isKind(it.kind)) return t('codec.unknownInventory', { kind: isObj(it) ? String(it.kind) : '?' })
      if (!Number.isInteger(it.count) || (it.count as number) < 0 || (it.count as number) > LIMITS.inventoryCount) return t('codec.badCount')
    }
    return null
  } catch {
    return t('codec.unreadable')
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
    return { ok: false, error: t('codec.corrupt') }
  }
  const error = validateLevel(data)
  return error ? { ok: false, error } : { ok: true, level: data as Level }
}

/** Never throws: any failure becomes `{ ok: false, error }` with a message for the player. */
export async function decodeLevel(s: string): Promise<DecodeResult> {
  try {
    const bytes = await pump(new DecompressionStream('deflate-raw'), fromB64Url(s.trim()))
    return parseLevel(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return { ok: false, error: t('codec.brokenLink') }
  }
}

/**
 * Gives a level coming from a link or a file an id that cannot collide with a shipped or custom
 * level (progress and drafts are keyed by id): `shared-` + FNV-1a hash of its content.
 */
export function asShared(level: Level): Level {
  const text = JSON.stringify(level)
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return { ...level, id: `shared-${(h >>> 0).toString(36)}` }
}

export const shareUrl = (encoded: string, loc: { origin: string; pathname: string } = location): string => `${loc.origin}${loc.pathname}#l=${encoded}`

export function levelToFile(l: Level): Blob {
  return new Blob([JSON.stringify(l, null, 2)], { type: 'application/json' })
}

export async function levelFromFile(f: File): Promise<DecodeResult> {
  if (f.size > MAX_BYTES) return { ok: false, error: t('codec.fileTooBig') }
  try {
    return parseLevel(await f.text())
  } catch {
    return { ok: false, error: t('codec.fileUnreadable') }
  }
}
