import { describe, expect, it } from 'vitest'
import { allShortcuts, hintsFor, type HintState } from '../../src/ui/shortcuts'

const base: HintState = { author: false, count: 0, single: false, zone: false, clip: false, mac: false }
const labels = (s: Partial<HintState>) => hintsFor({ ...base, ...s }).map((x) => x.label)

describe('hintsFor', () => {
  it('lists add, all and undo with nothing selected', () => {
    expect(hintsFor(base)).toEqual([
      { keys: ['Shift', 'clic'], label: 'ajouter' },
      { keys: ['Ctrl', 'A'], label: 'tout' },
      { keys: ['Ctrl', 'Z'], label: 'annuler' },
    ])
  })

  it('puts paste before undo once something was copied', () => {
    const hints = hintsFor({ ...base, clip: true })
    expect(hints.map((x) => x.label)).toEqual(['ajouter', 'tout', 'coller', 'annuler'])
    expect(hints[2].keys).toEqual(['Ctrl', 'V'])
  })

  it('lists the part actions for one part, with lock only in the editor', () => {
    const all = ['décaler (Shift ×5)', 'dupliquer', 'copier', 'pivoter', 'retourner', 'verrouiller', 'supprimer', 'désélectionner']
    expect(labels({ author: true, count: 1, single: true })).toEqual(all)
    expect(labels({ count: 1, single: true })).toEqual(all.filter((l) => l !== 'verrouiller'))
  })

  it('drops rotate and flip for several parts', () => {
    expect(labels({ author: true, count: 3 })).toEqual(['décaler (Shift ×5)', 'dupliquer', 'copier', 'verrouiller', 'supprimer', 'désélectionner'])
  })

  it('lists the zone actions for a goal zone', () => {
    expect(labels({ author: true, zone: true })).toEqual(['décaler', 'supprimer l’objectif', 'désélectionner'])
  })

  it('shows Cmd instead of Ctrl on a Mac', () => {
    expect(hintsFor({ ...base, mac: true })[1].keys).toEqual(['Cmd', 'A'])
  })
})

describe('allShortcuts', () => {
  const names = (author: boolean) => allShortcuts(author, false).map((x) => x.label)

  it('has the selection rectangle and the lock in the editor', () => {
    expect(names(true)).toContain('sélectionner au rectangle')
    expect(names(true)).toContain('verrouiller')
    expect(names(true)).toContain('supprimer l’objectif')
  })

  it('has no lock or zone entry in play mode, but runs the machine', () => {
    expect(names(false)).toContain('sélectionner au rectangle')
    expect(names(false)).not.toContain('verrouiller')
    expect(names(false)).not.toContain('supprimer l’objectif')
    expect(names(false)).toContain('lancer / arrêter la machine')
  })

  it('shows Cmd on a Mac', () => {
    expect(allShortcuts(false, true).find((x) => x.label === 'tout')?.keys).toEqual(['Cmd', 'A'])
  })
})
