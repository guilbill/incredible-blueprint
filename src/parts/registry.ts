import type { PartKind } from '../level/types'
import { BALLS } from './base/ball'
import { bucket } from './base/bucket'
import { ramp } from './base/ramp'
import { seesaw } from './base/seesaw'
import { trampoline } from './base/trampoline'
import { WALLS } from './base/wall'
import type { PartDef } from './types'

/** Registered parts; later tasks add entries. */
export const PART_DEFS: Partial<Record<PartKind, PartDef>> = {}
for (const def of [...BALLS, ...WALLS, ramp, bucket, trampoline, seesaw]) PART_DEFS[def.kind] = def

export function partDef(kind: PartKind): PartDef {
  const def = PART_DEFS[kind]
  if (!def) throw new Error(`Part kind "${kind}" is not registered in PART_DEFS`)
  return def
}
