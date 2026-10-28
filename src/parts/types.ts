import type { Body, RevoluteJoint } from 'planck'
import type { Rope } from '../engine/joints'
import type { Vec } from '../engine/vec'
import type { ContactEvent, World } from '../engine/world'
import type { PartKind, Placement, SimEventName } from '../level/types'
import type { PartDrawState, Pen } from '../render/pen'

export interface SettingDef { key: string; label: string; min: number; max: number; step: number; def: number }
export interface AnchorDef { key: string; local: Vec; role: 'rope' | 'belt' }

export interface PartDef {
  kind: PartKind
  label: string
  /** Default size in cells (unrotated). */
  size: { w: number; h: number }
  /** Size in cells for a given placement, when a setting changes it (e.g. `length`). Defaults to `size`. */
  sizeOf?(p: Placement): { w: number; h: number }
  /** 0 = not rotatable, else rot must be a multiple of it. */
  rotStep: 1 | 3 | 6 | 0
  flippable: boolean
  settings: SettingDef[]
  anchors: AnchorDef[]
  build(ctx: BuildCtx, p: Placement): PartInstance
  draw?(pen: Pen, s: PartDrawState): void
}

export interface PartInstance {
  id: string
  kind: PartKind
  bodies: Body[]
  /**
   * `local` is in the anchor body's frame. Belt anchors also give their wheel's ground `pin` and
   * `radius` (units), which set the belt ratio.
   */
  anchors: Record<string, { body: Body; local: Vec; radius: number; pin?: RevoluteJoint }>
  state: Record<string, number>
  glow: number
  onStep?(sim: SimCtx): void
  onContact?(ev: ContactEvent, self: Body, other: Body, sim: SimCtx): void
}

export interface BuildCtx {
  world: World
  /** Static body for pins. */
  ground: Body
}

export interface SimCtx {
  world: World
  step: number
  parts: PartInstance[]
  part(id: string): PartInstance | undefined
  ropes: Rope[]
  emit(name: SimEventName, part: string): void
  /** Sets glow = 1. */
  activate(part: PartInstance): void
}
