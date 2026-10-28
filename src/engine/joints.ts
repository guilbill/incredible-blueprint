import './dmath'
import { GearJoint, RevoluteJoint, RopeJoint } from 'planck'
import type { Body } from 'planck'
import type { Vec } from './vec'
import { World, toM, toMV, toUV } from './world'

/** Pins body to the static ground at worldAnchor (units). */
export const pin = (w: World, body: Body, worldAnchor: Vec): RevoluteJoint =>
  w.pl.createJoint(new RevoluteJoint({}, w.ground, body, toMV(worldAnchor)))!

/**
 * Couples two joints so that B turns `ratio` times as fast as A (gears: negative, belts: positive).
 * Planck enforces angleA + k·angleB = const, hence k = -1/ratio.
 */
export function gear(w: World, jA: RevoluteJoint, jB: RevoluteJoint, ratio: number): GearJoint {
  if (ratio === 0) throw new Error('gear ratio must be non-zero')
  return w.pl.createJoint(new GearJoint({}, jA.getBodyB(), jB.getBodyB(), jA, jB, -1 / ratio))!
}

/** speed in rad/s, maxTorque in kg·units²/s² (converted with SCALE²). Turn off with j.enableMotor(false). */
export function motor(j: RevoluteJoint, speed: number, maxTorque: number): void {
  j.setMotorSpeed(speed)
  j.setMaxMotorTorque(toM(toM(maxTorque)))
  j.enableMotor(true)
}

export interface Rope {
  joint: RopeJoint
  enabled: boolean
  cut(): void
  /** World anchors in units. */
  segment(): [Vec, Vec]
}

export function rope(w: World, a: Body, localA: Vec, b: Body, localB: Vec, maxLen: number): Rope {
  const joint = w.pl.createJoint(
    new RopeJoint({
      bodyA: a,
      bodyB: b,
      localAnchorA: toMV(localA),
      localAnchorB: toMV(localB),
      maxLength: toM(maxLen),
      collideConnected: true,
    }),
  )!
  const r: Rope = {
    joint,
    enabled: true,
    cut() {
      if (!r.enabled) return
      r.enabled = false
      w.pl.destroyJoint(joint)
    },
    segment() {
      return [toUV(joint.getAnchorA()), toUV(joint.getAnchorB())]
    },
  }
  return r
}
