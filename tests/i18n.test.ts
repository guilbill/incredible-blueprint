import { afterEach, describe, expect, it, vi } from 'vitest'
import { LANG_KEY, LEVELS_EN, MESSAGES, PART_NAMES_EN, SETTING_NAMES_EN, levelGoal, levelTitle, partLabel, setLang, t } from '../src/i18n'
import { PART_DEFS } from '../src/parts/registry'
import { loadLevels } from '../src/ui/levels'

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k) },
    setItem: (k, v) => { m.set(k, String(v)) },
  }
}

/** A fresh i18n module, so the language is detected again. */
async function freshI18n(): Promise<typeof import('../src/i18n')> {
  vi.resetModules()
  return import('../src/i18n')
}

afterEach(() => {
  vi.unstubAllGlobals()
  setLang('fr')
})

describe('dictionaries', () => {
  it('have the same keys in French and English, none empty', () => {
    expect(Object.keys(MESSAGES.en).sort()).toEqual(Object.keys(MESSAGES.fr).sort())
    for (const l of ['fr', 'en'] as const) for (const [k, text] of Object.entries(MESSAGES[l])) expect(text.trim(), `${l} ${k}`).not.toBe('')
  })

  it('name every registered part and every setting in English', () => {
    for (const [kind, def] of Object.entries(PART_DEFS)) {
      expect(PART_NAMES_EN[kind as keyof typeof PART_NAMES_EN], kind).toBeTruthy()
      for (const s of def!.settings) expect(SETTING_NAMES_EN[s.key], `${kind} ${s.key}`).toBeTruthy()
    }
  })

  it('translate the title and goal of every shipped level', () => {
    const levels = loadLevels()
    expect(levels).toHaveLength(10)
    for (const l of levels) {
      expect(LEVELS_EN[l.id]?.title, l.id).toBeTruthy()
      expect(LEVELS_EN[l.id]?.goalText, l.id).toBeTruthy()
    }
    expect(LEVELS_EN['10-la-grande-machine'].title).toBe('The Big Machine')
  })
})

describe('t', () => {
  it('fills placeholders and leaves unknown ones', () => {
    setLang('en')
    expect(t('codec.tooManyParts', { max: 300 })).toBe('This level has too many parts (300 at most).')
    expect(t('goals.inZone', { part: 'Bucket (p1)' })).toBe('Bucket (p1) in the zone · {time} s')
    setLang('fr')
    expect(t('codec.tooManyParts', { max: 300 })).toBe('Ce niveau a trop de pièces (300 au plus).')
  })

  it('shows English names and shipped level text in English, custom levels as authored', () => {
    setLang('en')
    expect(partLabel('ramp')).toBe('Ramp')
    expect(levelTitle({ id: '10-la-grande-machine', title: 'La grande machine' })).toBe('The Big Machine')
    expect(levelGoal({ id: 'niveau-x', goalText: 'Mon objectif' })).toBe('Mon objectif')
    setLang('fr')
    expect(partLabel('ramp')).toBe('Planche inclinée')
    expect(levelTitle({ id: '10-la-grande-machine', title: 'La grande machine' })).toBe('La grande machine')
  })
})

describe('lang', () => {
  it('follows navigator.language when nothing is saved', async () => {
    vi.stubGlobal('localStorage', memoryStorage())
    vi.stubGlobal('navigator', { language: 'fr-CA' })
    expect((await freshI18n()).lang()).toBe('fr')
    vi.stubGlobal('navigator', { language: 'de-DE' })
    expect((await freshI18n()).lang()).toBe('en')
  })

  it('persists setLang and prefers the saved choice', async () => {
    const mem = memoryStorage()
    vi.stubGlobal('localStorage', mem)
    vi.stubGlobal('navigator', { language: 'fr-FR' })
    ;(await freshI18n()).setLang('en')
    expect(JSON.parse(mem.getItem(LANG_KEY)!)).toBe('en')
    expect((await freshI18n()).lang()).toBe('en')
  })
})
