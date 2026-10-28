export type PartKind =
  | 'ball-bowling' | 'ball-base' | 'ball-basket' | 'ball-tennis' | 'wall-brick' | 'wall-wood' | 'ramp'
  | 'bucket' | 'trampoline' | 'seesaw' | 'gear-small' | 'gear-large' | 'pulley' | 'conveyor' | 'scissors'
  | 'mouse-cage' | 'monkey-bike' | 'candle' | 'balloon' | 'cat' | 'mouse' | 'cheese' | 'mousetrap'
  | 'fishbowl' | 'magnet' | 'portal' | 'spring' | 'fan'

/** x, y: centre of the part's footprint in units. rot: 0..23 in 15° steps (clockwise, y down). flip mirrors local x. */
export interface Placement {
  id: string
  kind: PartKind
  x: number
  y: number
  rot: number
  flip: boolean
  settings: Record<string, number>
}

export interface Anchor { part: string; anchor: string }
export interface Link { id: string; kind: 'rope' | 'belt'; a: Anchor; b: Anchor }

export type SimEventName = 'rope-cut' | 'cheese-eaten' | 'trap-snapped' | 'balloon-ceiling' | 'bowl-broken' | 'mouse-caught'

export type Goal =
  | { type: 'inZone'; part: string; zone: { x: number; y: number; w: number; h: number }; hold?: number }
  | { type: 'event'; event: SimEventName; part?: string }

export interface Level {
  v: 1
  id: string
  title: string
  goalText: string
  fixed: Placement[]
  fixedLinks: Link[]
  inventory: { kind: PartKind; count: number }[]
  goals: Goal[]
  verified?: boolean
}

export interface Solution { placements: Placement[]; links: Link[] }
