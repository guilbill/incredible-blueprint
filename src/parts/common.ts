import type { Body } from 'planck'
import type { Vec } from '../engine/vec'
import type { Placement } from '../level/types'
import type { PartInstance, SettingDef } from './types'

export const CELL = 20
export const ROT_ANGLE = Math.PI / 12

/**
 * Brief densities are relative values; DENSITY maps them to Planck kg/m² (×1, so a steel ball,
 * r 8 units = 0.2 m, weighs about 0.13 kg and a bowling ball about 1.15 kg).
 */
export const DENSITY = 1

/** Body angle in radians for a placement (clockwise on screen, since y points down). */
export const angleOf = (p: Placement): number => p.rot * ROT_ANGLE

/** Setting value from the placement, clamped and snapped to the setting's range, or its default. */
export function setting(p: Placement, s: SettingDef): number {
  const raw = p.settings[s.key]
  if (raw === undefined || !Number.isFinite(raw)) return s.def
  const stepped = s.min + Math.round((raw - s.min) / s.step) * s.step
  return Math.min(s.max, Math.max(s.min, stepped))
}

export const pos = (p: Placement): Vec => ({ x: p.x, y: p.y })

export function instance(p: Placement, bodies: Body[], anchors: PartInstance['anchors'] = {}): PartInstance {
  return { id: p.id, kind: p.kind, bodies, anchors, state: {}, glow: 0 }
}
