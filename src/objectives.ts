import { PART_NAMES_EN, lang, t } from './i18n'
import { footprint } from './level/placement'
import type { Goal, Level, PartKind, Placement } from './level/types'

/** French part names with their article, for sentences ("la bille d’acier"). */
const PART_NOUNS_FR: Record<PartKind, string> = {
  'ball-bowling': 'la boule de bowling',
  'ball-base': 'la bille d’acier',
  'ball-basket': 'le ballon de basket',
  'ball-tennis': 'la balle de tennis',
  'wall-brick': 'le mur de briques',
  'wall-wood': 'le mur en bois',
  ramp: 'la planche inclinée',
  bucket: 'le seau',
  trampoline: 'le trampoline',
  seesaw: 'la bascule',
  'gear-small': 'le petit engrenage',
  'gear-large': 'le grand engrenage',
  pulley: 'la poulie',
  conveyor: 'le tapis roulant',
  scissors: 'les ciseaux',
  'mouse-cage': 'la cage à souris',
  'monkey-bike': 'le singe à vélo',
  candle: 'la bougie',
  balloon: 'la montgolfière',
  cat: 'le chat',
  mouse: 'la souris',
  cheese: 'le fromage',
  mousetrap: 'la tapette à souris',
  fishbowl: 'le bocal à poisson',
  magnet: 'l’aimant',
  portal: 'le portail',
  spring: 'le ressort',
  fan: 'le ventilateur',
}

/** Parts a goal zone can sit in and be named after ("dans le seau"). */
const CONTAINERS: PartKind[] = ['bucket']

const noun = (kind: PartKind): string => (lang() === 'en' ? `the ${PART_NAMES_EN[kind].toLowerCase()}` : PART_NOUNS_FR[kind])

function contains(p: Placement, at: { x: number; y: number }): boolean {
  const fp = footprint(p)
  const xs = fp.map((q) => q.x)
  const ys = fp.map((q) => q.y)
  return Math.min(...xs) <= at.x && at.x <= Math.max(...xs) && Math.min(...ys) <= at.y && at.y <= Math.max(...ys)
}

/** "le seau", or "le seau de gauche" when the level has several: the side where it stands out most from the others. */
function placeName(c: Placement, parts: Placement[]): string {
  const others = parts.filter((p) => p.kind === c.kind && p.id !== c.id)
  if (!others.length) return noun(c.kind)
  const dx = c.x - others.reduce((s, p) => s + p.x, 0) / others.length
  const dy = c.y - others.reduce((s, p) => s + p.y, 0) / others.length
  const side = Math.abs(dy) > Math.abs(dx) ? (dy > 0 ? 'bottom' : 'top') : dx > 0 ? 'right' : 'left'
  const name = lang() === 'en' ? PART_NAMES_EN[c.kind].toLowerCase() : PART_NOUNS_FR[c.kind]
  return t(`objective.${side}`, { name })
}

function sentence(level: Pick<Level, 'fixed'>, g: Goal): string {
  if (g.type === 'event') return t(`objective.${g.event}`)
  const target = level.fixed.find((p) => p.id === g.part)
  const centre = { x: g.zone.x + g.zone.w / 2, y: g.zone.y + g.zone.h / 2 }
  const container = level.fixed.find((p) => p.id !== g.part && CONTAINERS.includes(p.kind) && contains(p, centre))
  return t('objective.inZone', {
    part: target ? noun(target.kind) : t('objective.anyPart'),
    place: container ? placeName(container, level.fixed) : t('objective.zone'),
  })
}

/** What the player must achieve, written from the goals alone: no hint on how to do it. */
export function objectiveText(level: Pick<Level, 'fixed' | 'goals'>): string {
  return [...new Set(level.goals.map((g) => sentence(level, g)))].join(' ')
}
