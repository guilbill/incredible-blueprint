import { t } from '../i18n'
import type { IconName } from './icons'

/** One shortcut: the keys to press (shown as key caps) and what they do. */
export interface Hint {
  keys: string[]
  label: string
}

export interface HintState {
  author: boolean
  /** Selected parts. */
  count: number
  single: boolean
  /** Every selected part is locked (editor). */
  allLocked?: boolean
  /** A goal zone is selected (editor). */
  zone: boolean
  /** Something was copied and can be pasted. */
  clip: boolean
  mac: boolean
}

const ARROWS = '←↑↓→'

const h = (keys: string[], key: string): Hint => ({ keys, label: t(key) })

/** The shortcuts worth showing right now, for the line under the board. */
export function hintsFor(s: HintState): Hint[] {
  const mod = s.mac ? 'Cmd' : 'Ctrl'
  const out: Hint[] = []
  if (s.zone) {
    out.push(h([ARROWS], 'hint.moveZone'), h([t('hint.del')], 'hint.deleteZone'))
  } else if (s.count === 0) {
    out.push(h(['Shift', t('hint.click')], 'hint.add'), h([mod, 'A'], 'hint.all'))
    if (s.clip) out.push(h([mod, 'V'], 'hint.paste'))
    out.push(h([mod, 'Z'], 'hint.undo'))
    return out
  } else if (s.author && s.allLocked) {
    out.push(h(['L'], 'hint.lock'))
  } else {
    out.push(h([ARROWS], 'hint.move'), h([mod, 'D'], 'hint.duplicate'), h([mod, 'C'], 'hint.copy'))
    out.push(h(['R'], 'hint.rotate'))
    if (s.single) out.push(h(['F'], 'hint.flip'))
    if (s.author) out.push(h(['L'], 'hint.lock'))
    out.push(h([t('hint.del')], 'hint.delete'))
  }
  out.push(h([t('hint.esc')], 'hint.deselect'))
  return out
}

/** Every shortcut of the board, for the help overlay. The editor adds locks and goal zones. */
export function allShortcuts(author: boolean, mac: boolean): Hint[] {
  const mod = mac ? 'Cmd' : 'Ctrl'
  const out: Hint[] = [
    h([t('hint.drag')], 'help.rect'),
    h(['Shift', t('hint.click')], 'hint.add'),
    h([mod, 'A'], 'hint.all'),
    h([ARROWS], 'hint.move'),
    h([mod, 'D'], 'hint.duplicate'),
    h([mod, 'C'], 'hint.copy'),
    h([mod, 'V'], 'hint.paste'),
    h(['R'], 'hint.rotate'),
    h(['Shift', 'R'], 'help.rotateBack'),
    h(['F'], 'hint.flip'),
  ]
  if (author) out.push(h(['L'], 'hint.lock'))
  out.push(h([t('hint.del')], 'hint.delete'))
  if (author) out.push(h([t('hint.del')], 'hint.deleteZone'))
  out.push(h([mod, 'Z'], 'hint.undo'), h([mod, 'Y'], 'help.redo'), h([t('hint.esc')], 'hint.deselect'))
  if (!author) out.push(h([t('hint.space')], 'help.run'))
  return out
}

/** One touch gesture: what the finger does (with the button's icon, if any) and its effect. */
export interface Gesture {
  gesture: string
  icon?: IconName
  label: string
}

const g = (gesture: string, label: string, icon?: IconName): Gesture => ({ gesture: t(gesture), label: t(label), icon })

/** Every gesture of the board, for the help overlay on a touch screen. */
export function allGestures(): Gesture[] {
  return [
    g('gesture.tapPart', 'gesture.select'),
    g('gesture.dragPart', 'gesture.move'),
    g('gesture.handle', 'gesture.turn'),
    g('gesture.dragVoid', 'help.rect'),
    g('gesture.addButton', 'gesture.add', 'select-add'),
    g('gesture.hold', 'gesture.menu'),
    g('gesture.tapVoid', 'hint.deselect'),
    { gesture: '↶ ↷', label: t('gesture.undo') },
  ]
}
