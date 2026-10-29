import type { Level, PartKind } from './level/types'
import { partDef } from './parts/registry'
import type { SettingDef } from './parts/types'
import { storage } from './storage'

/**
 * French and English UI text. `PartDef.label`, setting labels and the shipped levels' JSON stay in
 * French; the English names live here, keyed by part kind, setting key and level id.
 */
export type Lang = 'fr' | 'en'
export const LANGS: Lang[] = ['fr', 'en']
export const LANG_KEY = 'tim.lang'

const fr = {
  'common.close': 'Fermer',
  'lang.label': 'Langue',

  'list.title': 'Machine Incroyable Tribute',
  'list.subtitle': 'Plans de machines · choisissez un niveau',
  'list.tabShipped': 'Niveaux',
  'list.tabMine': 'Mes niveaux',
  'list.untitled': 'Sans titre',
  'list.solved': 'Réussi',
  'list.draft': 'En cours',
  'list.empty': 'Aucun niveau trouvé.',
  'list.new': '+ Nouveau niveau',
  'list.import': 'Importer un fichier',
  'list.play': 'Jouer',
  'list.delete': 'Supprimer',
  'list.confirmDelete': 'Supprimer le niveau « {title} » ? C’est définitif.',
  'level.verified': 'Vérifié',
  'level.untested': 'À tester',

  'error.deleteStorage': 'Impossible de supprimer ce niveau : le stockage du navigateur est indisponible.',
  'error.saveStorage': 'Impossible d’enregistrer ce niveau : le stockage du navigateur est indisponible.',

  'play.back': '← Niveaux',
  'play.parts': 'Pièces',
  'play.run': 'Lancer',
  'play.stop': 'Stop',
  'play.runTitle': 'Lancer / Stop (Espace)',
  'sound.on': 'Activer le son',
  'sound.off': 'Couper le son',
  'tool.rope': 'Corde',
  'tool.belt': 'Courroie',
  'win.title': 'Réussi !',
  'win.next': 'Suivant',
  'win.replay': 'Rejouer',
  'panel.flip': 'Miroir (F)',
  'panel.remove': 'Retirer',
  'toast.noRoom': 'Pas la place ici',
  'retry.still': 'La machine s’est arrêtée.',
  'retry.long': 'La machine tourne depuis un moment sans atteindre le but.',
  'retry.button': 'Réessayer',
  'toast.cannotLink': 'Liaison impossible',
  'toast.noRope': 'Cette pièce ne prend pas de corde.',
  'toast.noBelt': 'Cette pièce ne prend pas de courroie.',
  'toast.zoneTooSmall': 'Zone trop petite',
  'toast.beltDropped': 'Courroie retirée : les engrenages s\'entraînent déjà.',
  'toast.jammed': 'La machine s’est enrayée… Modifiez-la puis relancez.',

  'editor.title': 'Éditeur',
  'editor.test': 'Tester',
  'editor.testTitle': 'Jouer le niveau : il faut le réussir pour pouvoir le partager',
  'editor.share': 'Partager',
  'editor.export': 'Exporter',
  'editor.level': 'Niveau',
  'editor.titleLabel': 'Titre',
  'editor.goalLabel': 'Consigne',
  'editor.goalPlaceholder': 'Ce que le joueur doit faire…',
  'editor.inventory': 'Inventaire du joueur',
  'editor.shareFirst': 'Réussissez d’abord le niveau en mode test',
  'editor.unsaved': 'Non enregistré (stockage indisponible)',
  'editor.noGoal': 'Ajoutez un objectif',
  'editor.traceCancelled': 'La pièce visée a été retirée : tracé de la zone annulé.',
  'editor.copied': 'Lien copié !',
  'editor.copyThis': 'Copiez ce lien :',
  'editor.back': '← Éditeur',
  'editor.backToEditor': 'Retour à l’éditeur',
  'editor.newLevel': 'Nouveau niveau',

  'goals.title': 'Objectifs',
  'goals.inZone': '{part} dans la zone · {time} s',
  'goals.hold': 'tenir {time}',
  'goals.trace': 'Tracer la zone',
  'goals.cancel': 'Annuler',
  'goals.traceHint': 'Glissez sur le plan pour tracer la zone. Échap pour annuler.',
  'goals.add': 'Ajouter',
  'goals.zoneForm': 'Objet dans une zone',
  'goals.eventForm': 'Événement',
  'goals.remove': 'Retirer cet objectif',
  'goals.none': 'Aucun objectif : ajoutez-en au moins un.',
  'goals.anyPart': 'n’importe quelle pièce',
  'event.rope-cut': 'Corde coupée',
  'event.cheese-eaten': 'Fromage mangé',
  'event.trap-snapped': 'Tapette déclenchée',
  'event.balloon-ceiling': 'Ballon au plafond',
  'event.bowl-broken': 'Bocal cassé',
  'event.mouse-caught': 'Souris attrapée',

  'codec.fixedPart': 'Pièce fixe',
  'codec.badPart': '{where} : pièce invalide.',
  'codec.noId': '{where} : identifiant manquant.',
  'codec.unknownPart': 'Pièce inconnue : « {kind} ».',
  'codec.offField': 'La pièce « {id} » sort du terrain.',
  'codec.malformed': 'La pièce « {id} » est mal formée.',
  'codec.badRot': 'La pièce « {id} » a une rotation interdite.',
  'codec.noFlip': 'La pièce « {id} » ne peut pas être retournée.',
  'codec.unknownSetting': 'La pièce « {id} » a un réglage inconnu : « {key} ».',
  'codec.settingRange': 'Le réglage « {key} » de « {id} » est hors limites.',
  'codec.unreadable': 'Ce niveau est illisible.',
  'codec.version': 'Ce niveau vient d’une autre version du jeu.',
  'codec.badLevelId': 'L’identifiant du niveau est invalide.',
  'codec.noText': 'Il manque le titre ou l’objectif du niveau.',
  'codec.titleLong': 'Le titre est trop long ({max} caractères au plus).',
  'codec.goalLong': 'L’objectif est trop long ({max} caractères au plus).',
  'codec.incomplete': 'Le niveau est incomplet.',
  'codec.tooManyParts': 'Ce niveau a trop de pièces ({max} au plus).',
  'codec.tooManyLinks': 'Ce niveau a trop de liens ({max} au plus).',
  'codec.tooManyGoals': 'Ce niveau a trop d’objectifs ({max} au plus).',
  'codec.duplicateId': 'Identifiant en double : « {id} ».',
  'codec.overlap': 'La pièce « {id} » chevauche une autre pièce ou sort du terrain.',
  'codec.badLink': 'Un lien est mal formé.',
  'codec.linkMissing': 'Le lien « {id} » vise une pièce absente.',
  'codec.linkAnchor': 'Le lien « {id} » vise un point d’attache inconnu.',
  'codec.linkRole': 'Le lien « {id} » ne peut pas s’attacher là.',
  'codec.linkSelf': 'Le lien « {id} » relie une pièce à elle-même.',
  'codec.linkGears': 'Le lien « {id} » est impossible : ces engrenages s’entraînent déjà.',
  'codec.badGoal': 'Un objectif est mal formé.',
  'codec.badZone': 'Une zone d’objectif est mal formée.',
  'codec.zoneOff': 'Une zone d’objectif sort du terrain.',
  'codec.badHold': 'Un objectif a une durée invalide.',
  'codec.goalMissing': 'Un objectif vise une pièce absente.',
  'codec.badEvent': 'Un objectif a un événement inconnu.',
  'codec.badGoalType': 'Un objectif est de type inconnu.',
  'codec.unknownInventory': 'Pièce d’inventaire inconnue : « {kind} ».',
  'codec.badCount': 'Une quantité d’inventaire est invalide.',
  'codec.corrupt': 'Ce niveau est illisible : le contenu est corrompu.',
  'codec.brokenLink': 'Ce lien est cassé ou incomplet : impossible de lire le niveau.',
  'codec.fileTooBig': 'Ce fichier est trop gros pour être un niveau.',
  'codec.fileUnreadable': 'Impossible de lire ce fichier.',
}

type Key = keyof typeof fr

const en: Record<Key, string> = {
  'common.close': 'Close',
  'lang.label': 'Language',

  'list.title': 'Machine Incroyable Tribute',
  'list.subtitle': 'Machine blueprints · pick a level',
  'list.tabShipped': 'Levels',
  'list.tabMine': 'My levels',
  'list.untitled': 'Untitled',
  'list.solved': 'Solved',
  'list.draft': 'In progress',
  'list.empty': 'No levels found.',
  'list.new': '+ New level',
  'list.import': 'Import a file',
  'list.play': 'Play',
  'list.delete': 'Delete',
  'list.confirmDelete': 'Delete the level "{title}"? This cannot be undone.',
  'level.verified': 'Verified',
  'level.untested': 'Untested',

  'error.deleteStorage': 'Can’t delete this level: browser storage is unavailable.',
  'error.saveStorage': 'Can’t save this level: browser storage is unavailable.',

  'play.back': '← Levels',
  'play.parts': 'Parts',
  'play.run': 'Run',
  'play.stop': 'Stop',
  'play.runTitle': 'Run / Stop (Space)',
  'sound.on': 'Turn sound on',
  'sound.off': 'Mute',
  'tool.rope': 'Rope',
  'tool.belt': 'Belt',
  'win.title': 'Solved!',
  'win.next': 'Next',
  'win.replay': 'Replay',
  'panel.flip': 'Mirror (F)',
  'panel.remove': 'Remove',
  'toast.noRoom': 'No room here',
  'retry.still': 'The machine has stopped.',
  'retry.long': 'The machine has been running a while without reaching the goal.',
  'retry.button': 'Try again',
  'toast.cannotLink': 'Can’t link that',
  'toast.noRope': 'This part takes no rope.',
  'toast.noBelt': 'This part takes no belt.',
  'toast.zoneTooSmall': 'Zone too small',
  'toast.beltDropped': 'Belt removed: those gears already drive each other.',
  'toast.jammed': 'The machine jammed… Change it and run it again.',

  'editor.title': 'Editor',
  'editor.test': 'Test',
  'editor.testTitle': 'Play the level: you have to beat it before you can share it',
  'editor.share': 'Share',
  'editor.export': 'Export',
  'editor.level': 'Level',
  'editor.titleLabel': 'Title',
  'editor.goalLabel': 'Instructions',
  'editor.goalPlaceholder': 'What the player has to do…',
  'editor.inventory': 'Player inventory',
  'editor.shareFirst': 'Beat the level in test mode first',
  'editor.unsaved': 'Not saved (storage unavailable)',
  'editor.noGoal': 'Add a goal',
  'editor.traceCancelled': 'The target part was removed: zone drawing cancelled.',
  'editor.copied': 'Link copied!',
  'editor.copyThis': 'Copy this link:',
  'editor.back': '← Editor',
  'editor.backToEditor': 'Back to the editor',
  'editor.newLevel': 'New level',

  'goals.title': 'Goals',
  'goals.inZone': '{part} in the zone · {time} s',
  'goals.hold': 'hold {time}',
  'goals.trace': 'Draw the zone',
  'goals.cancel': 'Cancel',
  'goals.traceHint': 'Drag on the blueprint to draw the zone. Esc to cancel.',
  'goals.add': 'Add',
  'goals.zoneForm': 'Object in a zone',
  'goals.eventForm': 'Event',
  'goals.remove': 'Remove this goal',
  'goals.none': 'No goals yet: add at least one.',
  'goals.anyPart': 'any part',
  'event.rope-cut': 'Rope cut',
  'event.cheese-eaten': 'Cheese eaten',
  'event.trap-snapped': 'Trap snapped',
  'event.balloon-ceiling': 'Balloon at the ceiling',
  'event.bowl-broken': 'Bowl broken',
  'event.mouse-caught': 'Mouse caught',

  'codec.fixedPart': 'Fixed part',
  'codec.badPart': '{where}: invalid part.',
  'codec.noId': '{where}: missing id.',
  'codec.unknownPart': 'Unknown part: "{kind}".',
  'codec.offField': 'Part "{id}" is off the field.',
  'codec.malformed': 'Part "{id}" is malformed.',
  'codec.badRot': 'Part "{id}" has a forbidden rotation.',
  'codec.noFlip': 'Part "{id}" cannot be flipped.',
  'codec.unknownSetting': 'Part "{id}" has an unknown setting: "{key}".',
  'codec.settingRange': 'Setting "{key}" of "{id}" is out of range.',
  'codec.unreadable': 'This level can’t be read.',
  'codec.version': 'This level comes from another version of the game.',
  'codec.badLevelId': 'The level id is invalid.',
  'codec.noText': 'The level is missing its title or goal.',
  'codec.titleLong': 'The title is too long ({max} characters at most).',
  'codec.goalLong': 'The goal is too long ({max} characters at most).',
  'codec.incomplete': 'The level is incomplete.',
  'codec.tooManyParts': 'This level has too many parts ({max} at most).',
  'codec.tooManyLinks': 'This level has too many links ({max} at most).',
  'codec.tooManyGoals': 'This level has too many goals ({max} at most).',
  'codec.duplicateId': 'Duplicate id: "{id}".',
  'codec.overlap': 'Part "{id}" overlaps another part or is off the field.',
  'codec.badLink': 'A link is malformed.',
  'codec.linkMissing': 'Link "{id}" points to a missing part.',
  'codec.linkAnchor': 'Link "{id}" points to an unknown anchor.',
  'codec.linkRole': 'Link "{id}" can’t attach there.',
  'codec.linkSelf': 'Link "{id}" joins a part to itself.',
  'codec.linkGears': 'Link "{id}" is impossible: those gears already drive each other.',
  'codec.badGoal': 'A goal is malformed.',
  'codec.badZone': 'A goal zone is malformed.',
  'codec.zoneOff': 'A goal zone is off the field.',
  'codec.badHold': 'A goal has an invalid duration.',
  'codec.goalMissing': 'A goal points to a missing part.',
  'codec.badEvent': 'A goal has an unknown event.',
  'codec.badGoalType': 'A goal has an unknown type.',
  'codec.unknownInventory': 'Unknown inventory part: "{kind}".',
  'codec.badCount': 'An inventory count is invalid.',
  'codec.corrupt': 'This level can’t be read: the content is corrupted.',
  'codec.brokenLink': 'This link is broken or incomplete: the level can’t be read.',
  'codec.fileTooBig': 'This file is too big to be a level.',
  'codec.fileUnreadable': 'This file can’t be read.',
}

export const MESSAGES: Record<Lang, Record<Key, string>> = { fr, en }

/** English part names; the French ones are `PartDef.label`. */
export const PART_NAMES_EN: Record<PartKind, string> = {
  'ball-bowling': 'Bowling ball',
  'ball-base': 'Baseball',
  'ball-basket': 'Basketball',
  'ball-tennis': 'Tennis ball',
  'wall-brick': 'Brick wall',
  'wall-wood': 'Wooden wall',
  ramp: 'Ramp',
  bucket: 'Bucket',
  trampoline: 'Trampoline',
  seesaw: 'Seesaw',
  'gear-small': 'Small gear',
  'gear-large': 'Large gear',
  pulley: 'Pulley',
  conveyor: 'Conveyor belt',
  scissors: 'Scissors',
  'mouse-cage': 'Mouse cage',
  'monkey-bike': 'Monkey bike',
  candle: 'Candle',
  balloon: 'Hot air balloon',
  cat: 'Cat',
  mouse: 'Mouse',
  cheese: 'Cheese',
  mousetrap: 'Mousetrap',
  fishbowl: 'Fishbowl',
  magnet: 'Magnet',
  portal: 'Portal',
  spring: 'Spring',
  fan: 'Fan',
}

/** English setting labels by setting key (a key means the same thing on every part). */
export const SETTING_NAMES_EN: Record<string, string> = {
  length: 'Length',
  power: 'Power',
  delay: 'Delay (× 0.5 s)',
  channel: 'Channel',
  start: 'Start (0 = on hit, 1 = right away)',
  lit: 'Lit',
  force: 'Force',
}

/** English title and goal of the shipped levels, by level id. */
export const LEVELS_EN: Record<string, { title: string; goalText: string }> = {
  '01-premier-plan': { title: 'First Blueprint', goalText: 'Drop the ball into the bucket.' },
  '02-rebond': { title: 'Bounce', goalText: 'Get the ball over the wall and into the bucket.' },
  '03-la-bascule': { title: 'The Seesaw', goalText: 'Launch the baseball into the bucket.' },
  '04-petit-moteur': { title: 'Little Motor', goalText: 'Start the conveyor belt to carry the ball into the bucket.' },
  '05-engrenages': { title: 'Gears', goalText: 'Link the two gears so the conveyor carries the ball to the bucket.' },
  '06-coupez': { title: 'Cut!', goalText: 'Cut the rope to drop the bucket onto the mark.' },
  '07-montgolfiere': { title: 'Hot Air Balloon', goalText: 'Fly the hot air balloon all the way up.' },
  '08-chat-et-souris': { title: 'Cat and Mouse', goalText: 'Lead the mouse to the cheese without waking the cat.' },
  '09-attraction': { title: 'Attraction', goalText: 'Send the baseball into the basket, up in the top right corner.' },
  '10-la-grande-machine': { title: 'The Big Machine', goalText: 'Set the whole machine going so the baseball ends up in the bucket.' },
}

let current: Lang | undefined

/** Saved choice, else the browser language (French for any `fr*`, English otherwise). */
export function lang(): Lang {
  if (!current) {
    const saved = storage.get<unknown>(LANG_KEY, null)
    current = saved === 'fr' || saved === 'en' ? saved : globalThis.navigator?.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
  }
  return current
}

export function setLang(l: Lang): void {
  current = l
  storage.set(LANG_KEY, l)
  if (typeof document !== 'undefined') document.documentElement.lang = l
}

/** The message for `key` in the current language, `{name}` placeholders filled from `params`. */
export function t(key: string, params?: Record<string, string | number>): string {
  const text = MESSAGES[lang()][key as Key] ?? key
  return params ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : text
}

export function partLabel(kind: PartKind): string {
  return lang() === 'en' ? PART_NAMES_EN[kind] : partDef(kind).label
}

export function settingLabel(s: SettingDef): string {
  return lang() === 'en' ? (SETTING_NAMES_EN[s.key] ?? s.label) : s.label
}

/** Shipped levels are translated; custom and shared ones keep the text their author wrote. */
export function levelTitle(level: Pick<Level, 'id' | 'title'>): string {
  return lang() === 'en' ? (LEVELS_EN[level.id]?.title ?? level.title) : level.title
}

export function levelGoal(level: Pick<Level, 'id' | 'goalText'>): string {
  return lang() === 'en' ? (LEVELS_EN[level.id]?.goalText ?? level.goalText) : level.goalText
}
